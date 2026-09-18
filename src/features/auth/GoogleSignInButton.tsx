import { useEffect, useRef, useState } from 'react'
import type { FederatedInput } from '../../api/types'
import { getGoogleClientId } from '../../config/env'
import { Alert } from '../../ui/Alert'
import { createNonce, loadGoogleIdentity } from './googleIdentity'

type ButtonText = 'signin_with' | 'signup_with' | 'continue_with'

function prefersDark(): boolean {
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme) {
    return theme === 'dark'
  }
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Renders Google's official sign-in button. Each credential carries a fresh nonce that the
 * backend checks against the ID token. Renders nothing when VITE_GOOGLE_CLIENT_ID is unset.
 */
export function GoogleSignInButton({
  text = 'continue_with',
  divider = false,
  onCredential,
}: {
  text?: ButtonText
  /** Show an "or" separator below the button, for placement above an email form. */
  divider?: boolean
  onCredential: (input: FederatedInput) => void | Promise<void>
}) {
  const clientId = getGoogleClientId()
  const containerRef = useRef<HTMLDivElement>(null)
  const onCredentialRef = useRef(onCredential)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    onCredentialRef.current = onCredential
  }, [onCredential])

  useEffect(() => {
    if (!clientId) {
      return
    }
    let cancelled = false
    void loadGoogleIdentity()
      .then((api) => {
        const container = containerRef.current
        if (cancelled || !container) {
          return
        }
        const initialize = () => {
          const nonce = createNonce()
          api.initialize({
            client_id: clientId,
            nonce,
            ux_mode: 'popup',
            auto_select: false,
            use_fedcm_for_button: true,
            callback: (response) => {
              // Rotate the nonce so each ID token is single-use from this page's point of view.
              initialize()
              void onCredentialRef.current({ client_id: clientId, nonce, id_token: response.credential })
            },
          })
        }
        initialize()
        api.renderButton(container, {
          type: 'standard',
          theme: prefersDark() ? 'filled_black' : 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(400, Math.max(200, Math.floor(container.clientWidth) || 320)),
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load Google sign-in')
        }
      })
    return () => {
      cancelled = true
    }
  }, [clientId, text])

  if (!clientId) {
    return null
  }

  return (
    <div className="stack">
      {loadError ? <Alert tone="error">{loadError}</Alert> : null}
      <div ref={containerRef} className="google-signin" data-testid="google-signin" />
      {divider ? (
        <div className="auth-divider" role="separator">
          <span>or</span>
        </div>
      ) : null}
    </div>
  )
}
