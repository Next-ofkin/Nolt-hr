import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret')
}

const siteUrl = Deno.env.get('SITE_URL') ?? supabaseUrl
const authCallbackUrl = new URL('/auth/callback', siteUrl).href

const ALLOWED_ROLES = ['admin', 'hr', 'employee'] as const
type Role = (typeof ALLOWED_ROLES)[number]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

Deno.serve(async (req) => {
  // Handle CORS preflight from the browser.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Validate the caller's JWT (the platform also verifies it, but
  // we re-check so the role decision below is trustworthy).
  const { data: tokenData, error: tokenError } = await supabase.auth.getUser(token)
  if (tokenError || !tokenData.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // Fetch the caller's role from profiles (service role bypasses RLS).
  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', tokenData.user.id)
    .single()
  const callerRole = caller?.role ?? null

  if (callerRole !== 'admin' && callerRole !== 'hr') {
    return json({ error: 'Only admins and HR can invite users' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  const fullName = String(body.full_name ?? '').trim()
  const requestedRole = String(body.role ?? 'employee') as Role

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'A valid email is required' }, 400)
  }
  if (!fullName) {
    return json({ error: 'Full name is required' }, 400)
  }
  if (!ALLOWED_ROLES.includes(requestedRole)) {
    return json({ error: 'Invalid role' }, 400)
  }
  // HR may only invite employees; only admins may grant hr/admin.
  if (callerRole === 'hr' && requestedRole !== 'employee') {
    return json({ error: 'HR can only invite users with the employee role' }, 403)
  }

  const invite = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: authCallbackUrl,
  })

  if (invite.error) {
    return json({ error: invite.error.message }, 400)
  }

  const invitedUser = invite.data.user
  const metadata = await supabase.auth.admin.updateUserById(invitedUser.id, {
    app_metadata: { ...invitedUser.app_metadata, role: requestedRole },
  })
  if (metadata.error) {
    return json({ error: 'The invitation was sent, but its role could not be assigned' }, 500)
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: fullName, role: requestedRole })
    .eq('id', invitedUser.id)
  if (profileError) {
    return json({ error: 'The invitation was sent, but its profile could not be updated' }, 500)
  }

  return json({ ok: true, id: invitedUser.id })
})
