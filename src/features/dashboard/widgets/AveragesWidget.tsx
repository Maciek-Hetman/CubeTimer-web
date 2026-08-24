import { useApp } from '../../../app/AppProviders'
import { averageOfN, bestAverageOfN, bestSingle } from '../../../domain/stats/averages'
import { formatAverage } from '../../../domain/stats/formatTime'

const WINDOWS = [5, 12, 25, 50, 100]

export function AveragesWidget() {
  const { solves } = useApp()
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Avg</th>
          <th className="num">Current</th>
          <th className="num">Best</th>
        </tr>
      </thead>
      <tbody>
        {WINDOWS.map((n) => (
          <tr key={n}>
            <td>Ao{n}</td>
            <td className="num">{formatAverage(averageOfN(solves, n))}</td>
            <td className="num">{formatAverage(n === 1 ? bestSingle(solves) : bestAverageOfN(solves, n))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
