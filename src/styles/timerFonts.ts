import type { TimerFont } from '../domain/models'

const EAGER_FONTS: ReadonlySet<TimerFont> = new Set(['jetbrains', 'inter', 'system'])

const LOADERS: Partial<Record<TimerFont, () => Promise<unknown>>> = {
  fira: () => import('@fontsource-variable/fira-code/wght.css'),
  digital: () => import('@fontsource/share-tech-mono/400.css'),
  dseg7: () => import('@fontsource/dseg7-classic/400.css'),
  roboto: () => import('@fontsource-variable/roboto/wght.css'),
  'open-sans': () => import('@fontsource-variable/open-sans/wght.css'),
}

const pending = new Map<string, Promise<unknown>>()

export function loadTimerFont(font: TimerFont): void {
  if (EAGER_FONTS.has(font)) return
  const loader = LOADERS[font]
  if (!loader) return
  if (!pending.has(font)) {
    const promise = loader().catch(() => {
      pending.delete(font)
    })
    pending.set(font, promise)
  }
  void pending.get(font)
}
