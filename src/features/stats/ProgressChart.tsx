import { useId, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartPoint } from '../../data/repositories/solveStats'
import { STATS_CHART_SCALES, STATS_CHART_SCALE_LABELS, type StatsChartScale } from '../../domain/models'
import { Button } from '../../ui/Button'
import { Panel } from '../../ui/Panel'
import { scalePx, useUiScale } from '../../ui/useUiScale'
import { formatAxisSeconds, formatChartSeconds, solveTicks } from './chartAxes'

const CHART_SERIES = [
  // Single times are the noisy backdrop; the rolling averages carry the trend.
  { key: 'time', label: 'Time', color: 'var(--accent)', strokeWidth: 1, strokeOpacity: 0.45 },
  { key: 'ao5', label: 'Ao5', color: 'var(--chart-ao5)', strokeWidth: 2, strokeOpacity: 1 },
  { key: 'ao12', label: 'Ao12', color: 'var(--chart-ao12)', strokeWidth: 2, strokeOpacity: 1 },
] as const

type SeriesKey = (typeof CHART_SERIES)[number]['key']

export function ProgressChart({
  data,
  stale = false,
  scale,
  onScaleChange,
}: {
  /** Undefined while the first points load. */
  data: ChartPoint[] | undefined
  /** The points belong to the previous scale; shown dimmed until the new ones arrive. */
  stale?: boolean
  scale: StatsChartScale
  onScaleChange: (scale: StatsChartScale) => void
}) {
  const headingId = useId()
  const uiScale = useUiScale()
  const [hiddenSeries, setHiddenSeries] = useState<Partial<Record<SeriesKey, boolean>>>({})
  const xTicks = useMemo(() => data ? solveTicks(data) : undefined, [data])
  const tick = { fill: 'var(--text-muted)', fontSize: scalePx(12, uiScale) }

  const toggleSeries = (key: SeriesKey) =>
    setHiddenSeries((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <Panel role="region" aria-labelledby={headingId} className="stats-progress stack">
      <div className="stats-panel-header">
        <h2 id={headingId}>Progress</h2>
        <div className="stats-range" role="group" aria-label="Graph scale">
          {STATS_CHART_SCALES.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              aria-pressed={scale === option}
              aria-label={STATS_CHART_SCALE_LABELS[option]}
              title={`${STATS_CHART_SCALE_LABELS[option]} solves`}
              onClick={() => onScaleChange(option)}
            >
              {option === 'all' ? STATS_CHART_SCALE_LABELS.all : option}
            </Button>
          ))}
        </div>
      </div>
      <div className="stats-chart" aria-busy={data === undefined || stale || undefined}>
        {data === undefined ? (
          <p className="muted stats-chart-loading" role="status">
            Loading…
          </p>
        ) : (
          <div className="stats-chart-canvas" style={stale ? { opacity: 0.55 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="index"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  ticks={xTicks}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={scalePx(24, uiScale)}
                  tick={tick}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatAxisSeconds}
                  tick={tick}
                  width={scalePx(40, uiScale)}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-md)',
                    color: 'var(--text)',
                  }}
                  itemStyle={{ color: 'var(--text)' }}
                  labelStyle={{ color: 'var(--text-muted)', fontWeight: 600 }}
                  labelFormatter={(label) => `Solve ${label}`}
                  formatter={(value, name) => [formatChartSeconds(Number(value)), String(name)]}
                  itemSorter={(item) => CHART_SERIES.findIndex((series) => series.key === item.dataKey)}
                />
                {CHART_SERIES.map((series) =>
                  hiddenSeries[series.key] ? null : (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={series.strokeWidth}
                      strokeOpacity={series.strokeOpacity}
                      dot={false}
                      activeDot={{ r: scalePx(4, uiScale) }}
                      isAnimationActive={false}
                    />
                  ),
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="stats-legend" role="group" aria-label="Chart series visibility">
        {CHART_SERIES.map((series) => {
          const hidden = Boolean(hiddenSeries[series.key])
          return (
            <Button
              key={series.key}
              type="button"
              variant="ghost"
              aria-pressed={!hidden}
              onClick={() => toggleSeries(series.key)}
            >
              <span aria-hidden="true" className="stats-legend-key" style={{ backgroundColor: series.color }} />
              {series.label}
            </Button>
          )
        })}
      </div>
    </Panel>
  )
}
