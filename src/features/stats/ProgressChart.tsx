import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { ChartPoint } from '../../data/repositories/solveStats'
import { formatDuration } from '../../domain/stats/formatTime'
import { Panel } from '../../ui/Panel'
import { formatSecondsTick, integerTicks, niceValueScale } from './chartAxis'

type SeriesKey = 'time' | 'ao5' | 'ao12'

interface ChartSeries {
  key: SeriesKey
  label: string
  color: string
  width: number
  opacity: number
}

// Singles are the noisy backdrop; the rolling averages carry the trend, so they get the
// heavier strokes. Ao5 and Ao12 also differ in weight so they stay apart without color.
const CHART_SERIES: readonly ChartSeries[] = [
  { key: 'time', label: 'Single', color: 'var(--accent)', width: 1.25, opacity: 0.4 },
  { key: 'ao5', label: 'Ao5', color: 'var(--chart-ao5)', width: 1.5, opacity: 1 },
  { key: 'ao12', label: 'Ao12', color: 'var(--chart-ao12)', width: 2.75, opacity: 1 },
]

// Past this many points the dots merge into a smear, so singles fall back to a bare line.
const SINGLE_DOTS_MAX_POINTS = 150

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 12 }

function formatPointValue(value: number | null, key: SeriesKey): string {
  if (value === null) {
    return key === 'time' ? 'DNF' : '—'
  }
  return formatDuration(Math.round(value * 1000))
}

function SeriesKeyLine({ series, faded = false }: { series: ChartSeries; faded?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="stats-series-key"
      style={{
        borderTopColor: series.color,
        borderTopWidth: Math.max(2, Math.round(series.width)),
        opacity: faded ? 0.3 : Math.max(series.opacity, 0.55),
      }}
    />
  )
}

function ChartTooltip({
  active,
  payload,
  visibleSeries,
}: Pick<TooltipContentProps, 'active' | 'payload'> & { visibleSeries: readonly ChartSeries[] }) {
  if (!active || !payload?.length) {
    return null
  }
  const point = payload[0].payload as ChartPoint
  return (
    <div className="stats-tooltip">
      <div className="stats-tooltip-title">Solve {point.index}</div>
      {visibleSeries.map((series) => (
        <div key={series.key} className="stats-tooltip-row">
          <SeriesKeyLine series={series} />
          <span className="stats-tooltip-value">{formatPointValue(point[series.key], series.key)}</span>
          <span className="stats-tooltip-label">{series.label}</span>
        </div>
      ))}
    </div>
  )
}

export function ProgressChart({ data }: { data: ChartPoint[] }) {
  const [hidden, setHidden] = useState<Partial<Record<SeriesKey, boolean>>>({})
  const [plotWidth, setPlotWidth] = useState(640)
  const visibleSeries = useMemo(() => CHART_SERIES.filter((series) => !hidden[series.key]), [hidden])

  const { xDomain, xTicks, yScale } = useMemo(() => {
    const first = data[0]?.index ?? 1
    const last = data[data.length - 1]?.index ?? 1
    let min = Infinity
    let max = -Infinity
    for (const point of data) {
      for (const series of visibleSeries) {
        const value = point[series.key]
        if (value !== null) {
          if (value < min) min = value
          if (value > max) max = value
        }
      }
    }
    return {
      xDomain: (last > first ? [first, last] : [first - 1, last + 1]) as [number, number],
      // Roughly one solve-number label per 80px keeps the axis evenly spaced at any width.
      xTicks: integerTicks(first, last, Math.min(8, Math.max(3, Math.round(plotWidth / 80)))),
      yScale: min <= max ? niceValueScale(min, max) : niceValueScale(0, 1),
    }
  }, [data, visibleSeries, plotWidth])

  const showSingleDots = data.length <= SINGLE_DOTS_MAX_POINTS

  const yTickFormatter = (value: number) => formatSecondsTick(value, yScale.step)
  const yAxisWidth = Math.max(...yScale.ticks.map((tick) => yTickFormatter(tick).length)) * 7.5 + 14

  const toggle = (key: SeriesKey) => setHidden((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <Panel className="stats-chart-panel">
      <div className="stats-legend" role="group" aria-label="Chart series visibility">
        {CHART_SERIES.map((series) => {
          const isHidden = Boolean(hidden[series.key])
          return (
            <button
              key={series.key}
              type="button"
              className="stats-legend-item"
              aria-pressed={!isHidden}
              onClick={() => toggle(series.key)}
            >
              <SeriesKeyLine series={series} faded={isHidden} />
              {series.label}
            </button>
          )
        })}
      </div>
      <div className="stats-chart">
        <ResponsiveContainer width="100%" height="100%" onResize={(width) => setPlotWidth(width)}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="index"
              type="number"
              domain={xDomain}
              ticks={xTicks}
              allowDecimals={false}
              interval="preserveStartEnd"
              stroke="var(--border)"
              tickLine={false}
              tick={AXIS_TICK}
              tickMargin={8}
              height={32}
            />
            <YAxis
              domain={yScale.domain}
              ticks={yScale.ticks}
              allowDataOverflow
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              tickFormatter={yTickFormatter}
              tickMargin={6}
              width={yAxisWidth}
            />
            <Tooltip
              cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1, strokeOpacity: 0.5 }}
              isAnimationActive={false}
              content={(props) => <ChartTooltip {...props} visibleSeries={visibleSeries} />}
            />
            {visibleSeries.map((series) => (
              <Line
                key={series.key}
                // Singles are discrete solves, so straight segments; averages read as a trend.
                type={series.key === 'time' ? 'linear' : 'monotone'}
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={series.width}
                strokeOpacity={series.opacity}
                strokeLinejoin="round"
                strokeLinecap="round"
                dot={
                  series.key === 'time' && showSingleDots
                    ? { r: 2.5, fill: series.color, fillOpacity: 0.7, stroke: 'none' }
                    : false
                }
                activeDot={{ r: 4, fill: series.color, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
