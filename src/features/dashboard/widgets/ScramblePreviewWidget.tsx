import { useScramble } from '../../../contexts/ScrambleContext'
import { useSettings } from '../../../contexts/SettingsContext'
import type { CubeEvent } from '../../../domain/models'
import 'cubing/twisty'

const PUZZLE_IDS: Record<CubeEvent, string> = {
  '2x2': '2x2x2',
  '3x3': '3x3x3',
  '4x4': '4x4x4',
  '5x5': '5x5x5',
  megaminx: 'megaminx',
  pyraminx: 'pyraminx',
}

export function ScramblePreviewWidget() {
  const { scramble } = useScramble()
  const { settings } = useSettings()

  if (!scramble) {
    return <div className="muted" style={{ textAlign: 'center', padding: '16px' }}>Generating scramble…</div>
  }

  return (
    <div style={{ width: '100%', height: '250px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <twisty-player
        puzzle={PUZZLE_IDS[settings.event] || '3x3x3'}
        experimental-setup-alg={scramble}
        visualization="2D"
        control-panel="none"
        background="none"
        viewer-link="none"
        style={{ width: '100%', height: '100%' }}
      ></twisty-player>
    </div>
  )
}
