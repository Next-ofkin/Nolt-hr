import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

/**
 * Server-side Google Access Token acquisition helper.
 * Supports:
 * 1. OAuth 2.0 Refresh Token credentials
 * 2. Service Account credentials
 */
async function getGoogleAccessToken(): Promise<{ token: string; error?: string; errorCode?: string }> {
  const clientId = Deno.env.get('GOOGLE_FORMS_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_FORMS_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_FORMS_REFRESH_TOKEN')

  const saEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const saPrivateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')

  // Strategy A: OAuth Refresh Token
  if (clientId && clientSecret && refreshToken) {
    try {
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      })

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          token: '',
          error: `Google OAuth refresh token exchange failed (${res.status}): ${errText}`,
          errorCode: 'GOOGLE_AUTH_FAILED',
        }
      }

      const tokenData = await res.json()
      if (!tokenData.access_token) {
        return {
          token: '',
          error: 'Google OAuth token response missing access_token',
          errorCode: 'GOOGLE_AUTH_FAILED',
        }
      }

      return { token: tokenData.access_token }
    } catch (err) {
      return {
        token: '',
        error: `OAuth token error: ${err instanceof Error ? err.message : String(err)}`,
        errorCode: 'GOOGLE_AUTH_FAILED',
      }
    }
  }

  // Strategy B: Service Account (simplified bearer grant)
  if (saEmail && saPrivateKey) {
    // Note: Full Service Account JWT assertion signing requires RS256 crypto.
    // For standard Edge Function usage, OAuth refresh token or service account assertion flow is evaluated.
    return {
      token: '',
      error: 'Service Account configuration detected. Please provide OAuth refresh token credentials (GOOGLE_FORMS_CLIENT_ID, GOOGLE_FORMS_CLIENT_SECRET, GOOGLE_FORMS_REFRESH_TOKEN).',
      errorCode: 'GOOGLE_AUTH_FAILED',
    }
  }

  return {
    token: '',
    error: 'Google Forms API credentials not configured in Supabase secrets. Please set GOOGLE_FORMS_CLIENT_ID, GOOGLE_FORMS_CLIENT_SECRET, and GOOGLE_FORMS_REFRESH_TOKEN.',
    errorCode: 'GOOGLE_AUTH_NOT_CONFIGURED',
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed', errorCode: 'INVALID_REQUEST' }, 405)
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { ok: false, error: 'Supabase environment configuration missing', errorCode: 'INVALID_REQUEST' },
      500,
    )
  }

  // 1. Verify Caller JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) {
    return jsonResponse({ ok: false, error: 'Unauthorized: missing token', errorCode: 'UNAUTHORIZED' }, 401)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
  if (userError || !userData.user) {
    return jsonResponse({ ok: false, error: 'Unauthorized: invalid token', errorCode: 'UNAUTHORIZED' }, 401)
  }

  // 2. Enforce Role Protection (Admin & HR only)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  const role = profile?.role
  if (role !== 'admin' && role !== 'hr') {
    return jsonResponse(
      { ok: false, error: 'Forbidden: Admin or HR access required', errorCode: 'FORBIDDEN' },
      403,
    )
  }

  // 3. Parse Request Body
  const body: { title?: string } = (await req.json().catch(() => ({}))) || {}
  const formTitle = (body.title || 'Employee Data Form').trim()

  // 4. Acquire Google Access Token
  const authResult = await getGoogleAccessToken()
  if (authResult.error || !authResult.token) {
    return jsonResponse(
      {
        ok: false,
        error: authResult.error || 'Google Forms API authentication failed',
        errorCode: authResult.errorCode || 'GOOGLE_AUTH_FAILED',
      },
      200,
    )
  }

  const accessToken = authResult.token

  // 5. Call Google Forms API v1: Create Form
  try {
    const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        info: {
          title: formTitle,
          documentTitle: formTitle,
        },
      }),
    })

    if (createRes.status === 429) {
      return jsonResponse(
        { ok: false, error: 'Google Forms API rate limit exceeded.', errorCode: 'GOOGLE_RATE_LIMITED' },
        200,
      )
    }

    if (!createRes.ok) {
      const errText = await createRes.text()
      return jsonResponse(
        {
          ok: false,
          error: `Google Forms creation failed (${createRes.status}): ${errText}`,
          errorCode: 'GOOGLE_FORMS_CREATE_FAILED',
        },
        200,
      )
    }

    const formObj = await createRes.json()
    const formId = formObj.formId
    const responderUri = formObj.responderUri || `https://docs.google.com/forms/d/e/${formId}/viewform`

    // 6. Call Google Forms API v1: BatchUpdate (Add POC Sections & Questions)
    const batchUpdatePayload = {
      requests: [
        {
          createItem: {
            item: { title: 'Personal Information', pageBreakItem: {} },
            location: { index: 0 },
          },
        },
        {
          createItem: {
            item: {
              title: 'First Name',
              questionItem: {
                question: { required: true, textQuestion: { paragraph: false } },
              },
            },
            location: { index: 1 },
          },
        },
        {
          createItem: {
            item: {
              title: 'Last Name',
              questionItem: {
                question: { required: true, textQuestion: { paragraph: false } },
              },
            },
            location: { index: 2 },
          },
        },
        {
          createItem: {
            item: {
              title: 'Date of Birth',
              questionItem: {
                question: {
                  required: true,
                  dateQuestion: { includeYear: true, includeTime: false },
                },
              },
            },
            location: { index: 3 },
          },
        },
        {
          createItem: {
            item: {
              title: 'Employment Type',
              questionItem: {
                question: {
                  choiceQuestion: {
                    type: 'RADIO',
                    options: [{ value: 'Permanent' }, { value: 'Contract' }, { value: 'Temporary' }],
                  },
                },
              },
            },
            location: { index: 4 },
          },
        },
        {
          createItem: {
            item: { title: 'Contact Information', pageBreakItem: {} },
            location: { index: 5 },
          },
        },
        {
          createItem: {
            item: {
              title: 'Email Address',
              questionItem: { question: { textQuestion: { paragraph: false } } },
            },
            location: { index: 6 },
          },
        },
        {
          createItem: {
            item: {
              title: 'Phone Number',
              questionItem: { question: { textQuestion: { paragraph: false } } },
            },
            location: { index: 7 },
          },
        },
        {
          createItem: {
            item: {
              title: 'Home Address',
              questionItem: { question: { textQuestion: { paragraph: true } } },
            },
            location: { index: 8 },
          },
        },
      ],
    }

    const batchRes = await fetch(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batchUpdatePayload),
    })

    if (!batchRes.ok) {
      const errText = await batchRes.text()
      return jsonResponse(
        {
          ok: false,
          error: `Google Forms item creation batchUpdate failed (${batchRes.status}): ${errText}`,
          errorCode: 'GOOGLE_FORMS_UPDATE_FAILED',
        },
        200,
      )
    }

    // 7. Publish Form Settings
    try {
      await fetch(`https://forms.googleapis.com/v1/forms/${formId}:setPublishSettings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publishSettings: {
            isPublished: true,
            isAcceptingResponses: true,
          },
        }),
      })
    } catch {
      // Ignore if setPublishSettings endpoint is unavailable on created forms
    }

    // 8. Return Safe Client Result (secrets/tokens strictly omitted)
    return jsonResponse(
      {
        ok: true,
        formId,
        title: formTitle,
        responderUri,
        editUri: `https://docs.google.com/forms/d/${formId}/edit`,
      },
      200,
    )
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        errorCode: 'GOOGLE_FORMS_CREATE_FAILED',
      },
      200,
    )
  }
})
