import type { CubeEvent } from '../../domain/models'

const EVENT_IDS: Record<CubeEvent, string> = {
  '2x2': '222',
  '3x3': '333',
  '4x4': '444',
  '5x5': '555',
  megaminx: 'minx',
  pyraminx: 'pyram',
}

export async function generateScramble(event: CubeEvent): Promise<string> {
  const { randomScrambleForEvent } = await import('cubing/scramble')
  const { setSearchDebug } = await import('cubing/search')
  setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true })
  const scramble = await randomScrambleForEvent(EVENT_IDS[event])
  return scramble.toString()
}
