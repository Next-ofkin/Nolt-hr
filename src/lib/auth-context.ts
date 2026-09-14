import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type Result = { error: string | null }

export interface AuthContextValue {
  session: Session | null
  user: User | null
  isLoading: boolean
  authError: string | null
  sendMagicLink: (email: string) => Promise<Result>
  signInAdmin: (email: string, password: string) => Promise<Result>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
