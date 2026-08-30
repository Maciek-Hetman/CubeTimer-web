import { createContext, useContext } from 'react'
import type { AuthenticatedRequest, AuthSession, User } from '../api/types'

export interface AuthContextValue {
  ready: boolean
  ownerId: string
  user: User | null
  token: string | null
  role: string | null
  isAdmin: boolean
  enqueueWrites: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  resetPassword: (token: string, newPassword: string) => Promise<void>
  verifyEmail: (token: string) => Promise<void>
  resendVerificationEmail: (email: string) => Promise<void>
  deleteAccount: () => Promise<void>
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>
  applyAuthSession: (session: AuthSession, options?: { mergeGuest?: boolean }) => Promise<void>
  authenticatedRequest: AuthenticatedRequest
  refreshAccessToken: () => Promise<string>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
