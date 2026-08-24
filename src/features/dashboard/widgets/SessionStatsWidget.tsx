import { useMemo } from 'react'
import { useApp } from '../../../app/AppProviders'
import { averageOfN, bestSingle, meanOfSolves } from '../../../domain/stats/averages'
import { formatAverage } from '../../../domain/stats/formatTime'

export function SessionStatsWidget() {
  const { solves, currentSession } = useApp()
  const sessionSolves = useMemo(
    () => (currentSession ? solves.filter((solve) => solve.sessionId === currentSession.id) : []),
    [currentSession, solves],
  )
  return (
    <div className="stack">
      <div>{currentSession?.name ?? 'No session'}</div>
      <div>Solves {sessionSolves.length}</div>
      <div>Best {formatAverage(bestSingle(sessionSolves))}</div>
      <div>Mean {formatAverage(meanOfSolves(sessionSolves))}</div>
      <div>Ao5 {formatAverage(averageOfN(sessionSolves, 5))}</div>
    </div>
  )
}
