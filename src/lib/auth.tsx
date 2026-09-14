import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createAdminAuthClient, initialAuthSession, passwordAdminEmail, supabase } from './supabase'
import { AuthContext, type AuthContextValue } from './auth-context'
import { requestMagicLink, signInPasswordAdmin } from './auth-flows'
import { queryClient } from './queryClient'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthContextValue['session']>(null)
  const [user, setUser] = useState<AuthContextValue['user']>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const previousUserId = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    initialAuthSession
      .then(({ session: initialSession, error }) => {
        if (!active) return
        setSession(initialSession)
        setUser(initialSession?.user ?? null)
        previousUserId.current = initialSession?.user.id ?? null
        setAuthError(error)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!active) return
      const userId = currentSession?.user.id ?? null
      if (previousUserId.current !== userId) queryClient.clear()
      previousUserId.current = userId
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      if (currentSession) setAuthError(null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const sendMagicLink = useCallback(async (email: string) => {
    return requestMagicLink(supabase, email, window.location.origin, passwordAdminEmail)
  }, [])

  const signInAdmin = useCallback(async (email: string, password: string) => {
    const result = await signInPasswordAdmin(supabase, createAdminAuthClient(), email, password, passwordAdminEmail)
    if (!result.error) setAuthError(null)
    return result
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setAuthError(null)
    queryClient.clear()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, user, isLoading, authError, sendMagicLink, signInAdmin, signOut }),
    [session, user, isLoading, authError, sendMagicLink, signInAdmin, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
