import { apiRequest, type AuthenticatedRequest } from './client'
import type { AuthSession, FederatedInput, FederatedProvider, User } from './types'

export function register(email: string, password: string) {
  return apiRequest<{ status: string }>('/v1/auth/register', {
    method: 'POST',
    body: { email, password },
  })
}

export function resendVerification(email: string) {
  return apiRequest<{ status: string }>('/v1/auth/email/resend', {
    method: 'POST',
    body: { email },
  })
}

export function verifyEmail(token: string) {
  return apiRequest<AuthSession>('/v1/auth/email/verify', {
    method: 'POST',
    body: { token },
  })
}

export function login(email: string, password: string) {
  return apiRequest<AuthSession>('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export function refresh(refreshToken: string) {
  return apiRequest<AuthSession>('/v1/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  })
}

export function logout(refreshToken: string) {
  return apiRequest<void>('/v1/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  })
}

export function forgotPassword(email: string) {
  return apiRequest<{ status: string }>('/v1/auth/password/forgot', {
    method: 'POST',
    body: { email },
  })
}

export function resetPassword(token: string, newPassword: string) {
  return apiRequest<AuthSession>('/v1/auth/password/reset', {
    method: 'POST',
    body: { token, new_password: newPassword },
  })
}

export function federatedLogin(provider: FederatedProvider, input: FederatedInput) {
  return apiRequest<AuthSession>(`/v1/auth/federated/${provider}`, {
    method: 'POST',
    body: input,
  })
}

export function linkFederatedIdentity(
  request: AuthenticatedRequest,
  provider: FederatedProvider,
  input: FederatedInput,
) {
  return request<void>(`/v1/auth/link/${provider}`, {
    method: 'POST',
    body: input,
  })
}

export function getMe(accessToken: string) {
  return apiRequest<User>('/v1/me', { accessToken })
}

export function changePassword(
  request: AuthenticatedRequest,
  currentPassword: string,
  newPassword: string,
) {
  return request<void>('/v1/me/password', {
    method: 'PUT',
    body: { current_password: currentPassword, new_password: newPassword },
  })
}

export function deleteAccount(request: AuthenticatedRequest) {
  return request<void>('/v1/me', { method: 'DELETE' })
}
