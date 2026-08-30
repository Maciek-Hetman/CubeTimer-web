import { useSolves } from '../../../contexts/SolvesContext'
import { formatAverage } from '../../../domain/stats/formatTime'

const WINDOWS = [5, 12, 25, 50, 100] as const

export function AveragesWidget() {
  const { solveStats } = useSolves()
  const current = (n: number): number | null =>
    n === 5
      ? solveStats.ao5
      : n === 12
        ? solveStats.ao12
        : n === 25
          ? solveStats.ao25
          : n === 50
            ? solveStats.ao50
            : solveStats.ao100
  const best = (n: number): number | null =>
    n === 5
      ? solveStats.bestAo5
      : n === 12
        ? solveStats.bestAo12
        : n === 25
          ? solveStats.bestAo25
          : n === 50
            ? solveStats.bestAo50
            : solveStats.bestAo100
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Avg</th>
          <th className="center">Current</th>
          <th className="center">Best</th>
        </tr>
      </thead>
      <tbody>
        {WINDOWS.map((n) => (
          <tr key={n}>
            <td>Ao{n}</td>
            <td className="center">{formatAverage(current(n))}</td>
            <td className="center best-time">{formatAverage(best(n))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
