import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAuthCallbackUrl,
  cleanAuthRedirectUrl,
  isPasswordAdmin,
  requestMagicLink,
  restoreAuthSession,
  signInPasswordAdmin,
} from '../src/lib/auth-flows.ts'

test('buildAuthCallbackUrl constructs canonical callback URL with target continuation path', () => {
  const defaultUrl = buildAuthCallbackUrl()
  assert.equal(defaultUrl, 'http://localhost:5173/auth/callback?next=/employee')

  const customUrl = buildAuthCallbackUrl('http://localhost:5173', '/employee')
  assert.equal(customUrl, 'http://localhost:5173/auth/callback?next=/employee')

  const prodUrl = buildAuthCallbackUrl('https://nolt-hr.noltfinance.com', '/employee')
  assert.equal(prodUrl, 'https://nolt-hr.noltfinance.com/auth/callback?next=/employee')
})

test('admin email comparison is normalized', () => {
  assert.equal(isPasswordAdmin(' Admin@Example.com ', 'admin@example.com'), true)
  assert.equal(isPasswordAdmin('employee@example.com', 'admin@example.com'), false)
  assert.equal(isPasswordAdmin('admin@example.com', ''), false)
})

test('magic-link login never creates a new user and returns to the callback', async () => {
  let submitted: unknown
  const client = {
    auth: {
      signInWithOtp: async (input: unknown) => {
        submitted = input
        return { error: null }
      },
    },
  }

  const result = await requestMagicLink(
    client as never,
    ' Person@Example.com ',
    'https://hr.example.com',
    'admin@example.com',
  )

  assert.equal(result.error, null)
  assert.deepEqual(submitted, {
    email: 'person@example.com',
    options: {
      shouldCreateUser: false,
      emailRedirectTo: 'https://hr.example.com/auth/callback?next=/employee',
    },
  })
})

test('admin cannot request a magic link', async () => {
  let called = false
  const client = { auth: { signInWithOtp: async () => { called = true; return { error: null } } } }
  const result = await requestMagicLink(
    client as never, 'admin@example.com', 'https://hr.example.com', 'admin@example.com',
  )
  assert.match(result.error ?? '', /administrator password/i)
  assert.equal(called, false)
})

test('non-admin email cannot use the password path', async () => {
  let called = false
  const adminClient = { auth: { signInWithPassword: async () => { called = true } } }
  const result = await signInPasswordAdmin(
    {} as never,
    adminClient as never,
    'employee@example.com',
    'password',
    'admin@example.com',
  )
  assert.match(result.error ?? '', /magic link/i)
  assert.equal(called, false)
})

test('auth tokens and errors are removed from callback URLs', () => {
  assert.equal(
    cleanAuthRedirectUrl(
      'https://hr.example.com/auth/callback?error=denied&next=%2Fprofile#access_token=secret&refresh_token=secret2&type=invite',
    ),
    '/auth/callback?next=%2Fprofile',
  )
})

test('an invitation token is exchanged for a session', async () => {
  const expectedSession = { access_token: 'access', refresh_token: 'refresh' }
  let verified: unknown
  const client = {
    auth: {
      initialize: async () => ({ error: null }),
      verifyOtp: async (input: unknown) => {
        verified = input
        return { data: { session: expectedSession }, error: null }
      },
      getSession: async () => { throw new Error('getSession should not be called') },
    },
  }

  const result = await restoreAuthSession(
    client as never,
    'https://hr.example.com/auth/callback?token_hash=invite-token&type=invite',
  )

  assert.deepEqual(verified, { token_hash: 'invite-token', type: 'invite' })
  assert.equal(result.session, expectedSession)
  assert.equal(result.error, null)
})

test('an invalid redirect reports its authentication error', async () => {
  const client = {
    auth: {
      initialize: async () => ({ error: new Error('Invitation link has expired') }),
    },
  }
  const result = await restoreAuthSession(client as never, 'https://hr.example.com/auth/callback')
  assert.equal(result.session, null)
  assert.equal(result.error, 'Invitation link has expired')
})
