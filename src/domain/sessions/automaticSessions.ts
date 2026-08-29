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
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    .toLowerCase()
  return `${day} ${dayPartFromDate(date)}`
}

export function uniqueAutomaticSessionName(date: Date, existingNames: Iterable<string>): string {
  const base = automaticSessionName(date)
  const taken = new Set(existingNames)
  if (!taken.has(base)) {
    return base
  }
  let n = 2
  while (taken.has(`${base} ${n}`)) {
    n += 1
  }
  return `${base} ${n}`
}

export function latestSolveInSession(solves: Solve[], sessionId: string): Solve | undefined {
  return solves.reduce<Solve | undefined>((latest, solve) => {
    if (solve.sessionId !== sessionId || solve.deletedAt) {
      return latest
    }
    return !latest || latest.solvedAt < solve.solvedAt ? solve : latest
  }, undefined)
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
