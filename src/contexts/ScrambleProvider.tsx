import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { useSettings } from './SettingsContext'
import { ScrambleContext, type ScrambleContextValue } from './ScrambleContext'

export function ScrambleProvider({ children }: { children: ReactNode }) {
  const { ready } = useAuth()
  const { settings, setEvent } = useSettings()

  const [scramble, setScrambleStateValue] = useState('')
  const [scrambleState, setScrambleState] = useState<'loading' | 'ready' | 'error'>('loading')
  const scrambleRequest = useRef(0)
  const scrambleEventRef = useRef<typeof settings.event | null>(null)

  const loadScramble = useCallback(async () => {
    const event = settings.event
    const id = ++scrambleRequest.current
    setScrambleState('loading')
    try {
      const { generateScramble } = await import('../features/scramble/scrambleService')
      const value = await generateScramble(event)
      if (id === scrambleRequest.current) {
        setScrambleStateValue(value)
        setScrambleState('ready')
        scrambleEventRef.current = event
      }
    } catch {
      if (id === scrambleRequest.current) {
        setScrambleStateValue('')
        setScrambleState('error')
      }
    }
  }, [settings.event])

  const customScramble = useCallback((custom: string) => {
    setScrambleStateValue(custom)
    setScrambleState('ready')
  }, [])

  useEffect(() => {
    if (ready && scrambleEventRef.current !== settings.event) {
      void loadScramble()
    }
  }, [ready, settings.event, loadScramble])

  const value = useMemo<ScrambleContextValue>(
    () => ({
      scramble,
      event: settings.event,
      scrambleState,
      setEvent,
      loadScramble,
      generateNewScramble: loadScramble,
      customScramble,
      setScramble: customScramble,
    }),
    [scramble, settings.event, scrambleState, setEvent, loadScramble, customScramble],
  )

  return <ScrambleContext.Provider value={value}>{children}</ScrambleContext.Provider>
}
