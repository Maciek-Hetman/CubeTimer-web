import { ApiError } from '../../api/types'

// Minimal typings and loader for Google Identity Services (https://accounts.google.com/gsi/client).

export interface GoogleCredentialResponse {
  credential: string
}

interface GoogleIdConfiguration {
  client_id: string
  nonce: string
  callback: (response: GoogleCredentialResponse) => void
  ux_mode?: 'popup'
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
  use_fedcm_for_button?: boolean
}

interface GoogleButtonConfiguration {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
}

export interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void
  renderButton: (parent: HTMLElement, options: GoogleButtonConfiguration) => void
  disableAutoSelect: () => void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } }
  }
}

export const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

let loadPromise: Promise<GoogleAccountsId> | null = null

export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  const existing = window.google?.accounts?.id
  if (existing) {
    return Promise.resolve(existing)
  }
  if (loadPromise) {
    return loadPromise
  }
  loadPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GOOGLE_IDENTITY_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => {
      const api = window.google?.accounts?.id
      if (api) {
        resolve(api)
      } else {
        reject(new Error('Google Identity Services unavailable'))
      }
    }
    script.onerror = () => reject(new Error('Could not load Google sign-in'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    loadPromise = null
    throw error
  })
  return loadPromise
}

export function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function googleAuthErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'account_link_required') {
      return 'An account with this email already exists. Sign in with your password, then link Google from the Account page.'
    }
    return error.message
  }
  return fallback
}
