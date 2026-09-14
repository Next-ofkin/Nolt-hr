import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret')
}

const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'
const authCallbackUrl = new URL('/auth/callback?next=/employee', siteUrl).href

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

  // Validate the caller's JWT
  const { data: tokenData, error: tokenError } = await supabase.auth.getUser(token)
  if (tokenError || !tokenData.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const callerId = tokenData.user.id

  // Fetch the caller's role from profiles
  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .single()
  const callerRole = caller?.role ?? null

  if (callerRole !== 'admin' && callerRole !== 'hr') {
    return json({ error: 'Only admins and HR can invite users' }, 403)
  }

  const body = await req.json().catch(() => ({}))

  // -------------------------------------------------------------
  // MODE A: Employee Record Authoritative Invitation ({ employee_id })
  // -------------------------------------------------------------
  if (body.employee_id && typeof body.employee_id === 'string') {
    const employeeId = body.employee_id.trim()

    // 1. Load employee from database
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, first_name, middle_name, last_name, work_email, status, auth_user_id')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return json({ error: 'Employee record not found' }, 440)
    }

    if (employee.status === 'ARCHIVED') {
      return json({ error: 'Archived employees cannot be invited' }, 400)
    }

    if (employee.auth_user_id) {
      return json({ error: 'This employee is already linked to a user account' }, 400)
    }

    if (employee.status !== 'DRAFT') {
      return json({ error: `Cannot invite employee with lifecycle status ${employee.status}` }, 400)
    }

    const workEmail = String(employee.work_email ?? '').trim().toLowerCase()
    if (!workEmail) {
      return json({ error: 'Employee work email is required' }, 400)
    }

    const fullName = [employee.first_name, employee.middle_name, employee.last_name]
      .filter(Boolean)
      .join(' ')

    // 2. Create local invitation record in CREATING state
    const { data: invitation, error: invInsertError } = await supabase
      .from('employee_invitations')
      .insert({
        employee_id: employee.id,
        email: workEmail,
        status: 'CREATING',
        invited_by: callerId,
      })
      .select('id')
      .single()

    if (invInsertError || !invitation) {
      if (invInsertError?.code === '23505') {
        return json({ error: 'An active invitation already exists for this employee.' }, 409)
      }
      return json({ error: 'Failed to create invitation record' }, 500)
    }

    const invitationId = invitation.id

    // 3. Invite via Supabase Auth Admin API
    const inviteRes = await supabase.auth.admin.inviteUserByEmail(workEmail, {
      data: { full_name: fullName, employee_id: employee.id },
      redirectTo: authCallbackUrl,
    })

    if (inviteRes.error) {
      const isExistingUser = inviteRes.error.message.toLowerCase().includes('already') ||
        inviteRes.error.message.toLowerCase().includes('registered') ||
        inviteRes.error.status === 422

      await supabase
        .from('employee_invitations')
        .update({
          status: 'FAILED',
          failed_at: new Date().toISOString(),
          failure_code: isExistingUser ? 'EMAIL_EXISTS' : 'AUTH_INVITE_FAILED',
        })
        .eq('id', invitationId)

      if (isExistingUser) {
        return json({
          error: 'An application account already exists for this email. The account was not linked automatically. Please contact an administrator.',
        }, 400)
      }

      return json({ error: 'Failed to send invitation email. Please try again.' }, 400)
    }

    const invitedUser = inviteRes.data.user

    // 4. Update app_metadata safely with role "employee" and employee_id
    const updatedMetadata = { ...invitedUser.app_metadata, role: 'employee', employee_id: employee.id }
    const metadataRes = await supabase.auth.admin.updateUserById(invitedUser.id, {
      app_metadata: updatedMetadata,
    })

    if (metadataRes.error) {
      // Compensation: revoke created user and mark invitation failed
      await supabase.auth.admin.deleteUser(invitedUser.id).catch(() => {})
      await supabase
        .from('employee_invitations')
        .update({
          status: 'FAILED',
          failed_at: new Date().toISOString(),
          failure_code: 'METADATA_FAILED',
        })
        .eq('id', invitationId)
      return json({ error: 'Failed to assign application metadata to invited user' }, 500)
    }

    // 5. Finalize local employee record and invitation tracking row atomically via RPC
    const { error: rpcError } = await supabase.rpc('finalize_employee_invitation', {
      p_employee_id: employee.id,
      p_invitation_id: invitationId,
      p_auth_user_id: invitedUser.id,
      p_invited_by: callerId,
    })

    if (rpcError) {
      // Compensation: revoke created user and mark invitation failed
      await supabase.auth.admin.deleteUser(invitedUser.id).catch(() => {})
      await supabase
        .from('employee_invitations')
        .update({
          status: 'FAILED',
          failed_at: new Date().toISOString(),
          failure_code: 'FINALIZATION_FAILED',
        })
        .eq('id', invitationId)
      return json({ error: 'Failed to complete employee account linking' }, 500)
    }

    return json({ ok: true, id: invitedUser.id, invitation_id: invitationId })
  }

  // -------------------------------------------------------------
  // MODE B: Legacy Generic User Invitation
  // -------------------------------------------------------------
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
