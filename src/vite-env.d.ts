/// <reference types="vite/client" />
import * as React from 'react'

interface ImportMetaEnv {
  readonly VITE_CUBESYNC_URL?: string
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'twisty-player': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        puzzle?: string
        alg?: string
        'experimental-setup-alg'?: string
        visualization?: string
        'control-panel'?: string
        background?: string
        'viewer-link'?: string
      }
    }
  }
}
