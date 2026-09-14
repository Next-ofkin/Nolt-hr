import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

type Client = SupabaseClient<Database>
type Result = { error: string | null }
export type SessionResult = Result & { session: Session | null }

export const AUTH_CALLBACK_PATH = '/auth/callback'
export const DEFAULT_SITE_URL = 'http://localhost:5173'

export function buildAuthCallbackUrl(siteUrl?: string | null, next = '/employee'): string {
  const base = siteUrl?.trim() || DEFAULT_SITE_URL
  return new URL(`${AUTH_CALLBACK_PATH}?next=${next}`, base).href
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isPasswordAdmin(email: string, adminEmail: string) {
  return Boolean(adminEmail.trim()) && normalizeEmail(email) === normalizeEmail(adminEmail)
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function restoreAuthSession(client: Client, href: string): Promise<SessionResult> {
  try {
    // initialize() shares the SDK's existing promise, including redirect errors.
    // Waiting only for getSession() can hide an expired invitation's error.
    const { error: initializationError } = await client.auth.initialize()
    if (initializationError) {
      return { session: null, error: initializationError.message }
    }

    const params = new URL(href).searchParams
    const tokenHash = params.get('token_hash')
    if (tokenHash) {
      const type = params.get('type')
      if (type !== 'invite' && type !== 'email' && type !== 'magiclink') {
        return { session: null, error: 'This sign-in link is not supported. Request a new magic link.' }
      }
      // Supports token-hash email templates as well as the default ConfirmationURL.
      const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type })
      return { session: data.session, error: error?.message ?? null }
    }

    const { data, error } = await client.auth.getSession()
    return { session: data.session, error: error?.message ?? null }
  } catch (error) {
    return { session: null, error: errorMessage(error, 'Unable to complete sign-in. Please try again.') }
  }
}

export function cleanAuthRedirectUrl(href: string) {
  const url = new URL(href)
  const authParams = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
    'expires_in', 'expires_at', 'token_type', 'token_hash', 'type', 'code',
    'error', 'error_code', 'error_description']
  const hash = new URLSearchParams(url.hash.slice(1))
  for (const name of authParams) {
    url.searchParams.delete(name)
    hash.delete(name)
  }
  // Preserve unrelated anchors on ordinary application URLs.
  if (authParams.some((name) => new URLSearchParams(url.hash.slice(1)).has(name))) {
    url.hash = hash.toString()
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export async function requestMagicLink(
  client: Client, email: string, origin: string, adminEmail: string,
): Promise<Result> {
  if (isPasswordAdmin(email, adminEmail)) {
    return { error: 'Use your administrator password to sign in to this account.' }
  }
  try {
    const { error } = await client.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: buildAuthCallbackUrl(origin, '/employee'),
      },
    })
    return { error: error?.message ?? null }
  } catch (error) {
    return { error: errorMessage(error, 'Unable to send a sign-in link. Please try again.') }
  }
}

export async function signInPasswordAdmin(
  client: Client, adminClient: Client, email: string, password: string, adminEmail: string,
): Promise<Result> {
  if (!isPasswordAdmin(email, adminEmail)) {
    return { error: 'Please use a magic link to sign in to this account.' }
  }
  try {
    // This client never persists/broadcasts a session to the app before the role check.
    const { data, error } = await adminClient.auth.signInWithPassword({
      email: normalizeEmail(email), password,
    })
    if (error) return { error: error.message }
    if (!data.session || !data.user) return { error: 'Unable to sign in. Please try again.' }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles').select('role').eq('id', data.user.id).maybeSingle()
    if (profileError || profile?.role !== 'admin' || !isPasswordAdmin(data.user.email ?? '', adminEmail)) {
      await adminClient.auth.signOut({ scope: 'local' })
      return { error: profileError ? 'Unable to verify administrator access. Please try again.'
        : 'This account must use a magic link to sign in.' }
    }

    const { error: sessionError } = await client.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
    return { error: sessionError?.message ?? null }
  } catch (error) {
    return { error: errorMessage(error, 'Unable to sign in. Please try again.') }
  }
}
