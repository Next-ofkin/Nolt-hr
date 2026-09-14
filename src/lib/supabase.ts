import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { cleanAuthRedirectUrl, normalizeEmail, restoreAuthSession } from './auth-flows'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const passwordAdminEmail = normalizeEmail(import.meta.env.VITE_ADMIN_EMAIL ?? '')

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'implicit', detectSessionInUrl: true },
})

// Start once, outside React effects: StrictMode must never redeem a one-use link twice.
const initialUrl = window.location.href
export const initialAuthSession = restoreAuthSession(supabase, initialUrl).finally(() => {
  window.history.replaceState(window.history.state, '', cleanAuthRedirectUrl(window.location.href))
})

export function createAdminAuthClient() {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'nolt-hr-admin-password-check',
    },
  })
}
