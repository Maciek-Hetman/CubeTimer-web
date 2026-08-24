import type { CubeEvent, CubeSession, Solve } from '../models'

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night'

export function dayPartFromDate(date: Date): DayPart {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) {
    return 'morning'
  }
  if (hour >= 12 && hour < 17) {
    return 'afternoon'
  }
  if (hour >= 17 && hour < 22) {
    return 'evening'
  }
  return 'night'
}

export function automaticSessionName(date: Date): string {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
  return `${weekday} ${dayPartFromDate(date)}`
}

export function latestSolveInSession(solves: Solve[], sessionId: string): Solve | undefined {
  return solves
    .filter((solve) => solve.sessionId === sessionId && !solve.deletedAt)
    .sort((a, b) => (a.solvedAt < b.solvedAt ? 1 : -1))[0]
}

export function shouldReuseAutomaticSession(options: {
  session: CubeSession | undefined
  lastSolve: Solve | undefined
  nowMs: number
  gapMs: number
  event: CubeEvent
}): boolean {
  const { session, lastSolve, nowMs, gapMs, event } = options
  if (!session || session.deletedAt || session.archived || session.endedAt) {
    return false
  }
  if (session.kind !== 'automatic' || session.event !== event) {
    return false
  }
  const lastMs = lastSolve ? Date.parse(lastSolve.solvedAt) : Date.parse(session.startedAt)
  return nowMs - lastMs <= gapMs
}

export function findOpenAutomaticSession(
  sessions: CubeSession[],
  event: CubeEvent,
): CubeSession | undefined {
  return sessions.find(
    (session) =>
      !session.deletedAt &&
      !session.archived &&
      !session.endedAt &&
      session.kind === 'automatic' &&
      session.event === event,
  )
}
