import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    // Client for auth check
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service client for DB & Storage ops
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check user role
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'hr'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin or HR required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const importJobId = body.import_job_id

    if (!importJobId) {
      return new Response(JSON.stringify({ error: 'Missing import_job_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load import job
    const { data: job, error: jobErr } = await adminClient
      .from('form_import_jobs')
      .select('*')
      .eq('id', importJobId)
      .single()

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Import job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update status to ANALYZING
    await adminClient
      .from('form_import_jobs')
      .update({ status: 'ANALYZING' })
      .eq('id', importJobId)

    const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
    const model = Deno.env.get('FORM_IMPORT_MODEL') || 'gpt-4o-mini'

    if (!openAiApiKey) {
      // AI provider not configured
      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: 'AI_NOT_CONFIGURED',
          error_message: 'AI PDF import is not configured.',
        })
        .eq('id', importJobId)

      return new Response(
        JSON.stringify({ ok: false, error: 'AI PDF import is not configured.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Read PDF file from private bucket
    const { data: fileData, error: fileErr } = await adminClient.storage
      .from('form-imports')
      .download(job.source_object_path)

    if (fileErr || !fileData) {
      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: 'FILE_READ_ERROR',
          error_message: 'Failed to read source PDF file from storage.',
        })
        .eq('id', importJobId)

      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to read source PDF file.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Convert file to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // Call OpenAI Server-Side
    const promptText = `You are an expert HR form analyzer. Analyze this blank HR form PDF document and extract its structured template schema.
Return ONLY a JSON object matching this strict schema:
{
  "form": {
    "name": "Extracted Title",
    "category": "General",
    "description": "Brief summary",
    "instructions": "Instructions text",
    "presentation": { "mode": "DOCUMENT" }
  },
  "fields": [
    {
      "field_type": "SHORT_TEXT",
      "label": "Full Name",
      "field_key": "full_name",
      "required": false,
      "description": null,
      "placeholder": null,
      "configuration": {},
      "position": 0,
      "needs_review": false,
      "review_note": null
    }
  ],
  "warnings": []
}

Allowed field_type values: SHORT_TEXT, LONG_TEXT, EMAIL, PHONE, NUMBER, DATE, DROPDOWN, RADIO, CHECKBOX, YES_NO, FILE_UPLOAD, SIGNATURE, HEADING, PARAGRAPH, DIVIDER, REPEATING_GROUP.
Ensure field_key starts with a lowercase letter (^[a-z][a-z0-9_]*$).`

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You extract HR forms into JSON structures.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${base64Pdf}` },
              },
            ],
          },
        ],
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('OpenAI Error:', errText)
      await adminClient
        .from('form_import_jobs')
        .update({
          status: 'FAILED',
          error_code: 'AI_PROVIDER_ERROR',
          error_message: 'AI provider analysis failed.',
        })
        .eq('id', importJobId)

      return new Response(
        JSON.stringify({ ok: false, error: 'AI provider analysis failed.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiData = await aiRes.json()
    const content = aiData.choices?.[0]?.message?.content || '{}'
    const parsedSchema = JSON.parse(content)

    // Normalize field keys and positions
    const validFieldTypes = new Set([
      'SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'DATE',
      'DROPDOWN', 'RADIO', 'CHECKBOX', 'YES_NO', 'FILE_UPLOAD',
      'SIGNATURE', 'HEADING', 'PARAGRAPH', 'DIVIDER', 'REPEATING_GROUP',
    ])

    const normalizedFields = (parsedSchema.fields || []).map((f: Record<string, unknown>, idx: number) => {
      let type = String(f.field_type || 'SHORT_TEXT').toUpperCase()
      if (!validFieldTypes.has(type)) type = 'SHORT_TEXT'

      let key = String(f.field_key || `field_${idx}`).toLowerCase().trim()
      key = key.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
      if (!key || !/^[a-z]/.test(key)) {
        key = `field_${idx}`
      }

      return {
        field_type: type,
        label: String(f.label || `Field ${idx + 1}`),
        field_key: key,
        required: Boolean(f.required),
        description: f.description ? String(f.description) : null,
        placeholder: f.placeholder ? String(f.placeholder) : null,
        configuration: typeof f.configuration === 'object' && f.configuration ? f.configuration : {},
        position: idx,
        needs_review: Boolean(f.needs_review),
        review_note: f.review_note ? String(f.review_note) : null,
      }
    })

    const proposedSchema = {
      form: {
        name: String(parsedSchema.form?.name || job.original_filename.replace(/\.pdf$/i, '')),
        category: String(parsedSchema.form?.category || 'General'),
        description: parsedSchema.form?.description ? String(parsedSchema.form.description) : null,
        instructions: parsedSchema.form?.instructions ? String(parsedSchema.form.instructions) : null,
        presentation: parsedSchema.form?.presentation || { mode: 'DOCUMENT' },
      },
      fields: normalizedFields,
      warnings: Array.isArray(parsedSchema.warnings) ? parsedSchema.warnings : [],
    }

    // Save proposed schema & update status to READY_FOR_REVIEW
    await adminClient
      .from('form_import_jobs')
      .update({
        status: 'READY_FOR_REVIEW',
        proposed_schema: proposedSchema,
        provider: 'OpenAI',
        model: model,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importJobId)

    return new Response(
      JSON.stringify({ ok: true, job_id: importJobId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unhandled Edge Function Error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
