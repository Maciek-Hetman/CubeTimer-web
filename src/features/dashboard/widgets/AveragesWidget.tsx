import { useApp } from '../../../app/AppProviders'
import { averageOfN, bestAverageOfN, bestSingle } from '../../../domain/stats/averages'
import { formatAverage } from '../../../domain/stats/formatTime'

const WINDOWS = [5, 12, 25, 50, 100]

export function AveragesWidget() {
  const { solves } = useApp()
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Avg</th>
          <th>Current</th>
          <th>Best</th>
        </tr>
      </thead>
      <tbody>
        {WINDOWS.map((n) => (
          <tr key={n}>
            <td>Ao{n}</td>
            <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{formatAverage(averageOfN(solves, n))}</td>
            <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>
              {formatAverage(n === 1 ? bestSingle(solves) : bestAverageOfN(solves, n))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
