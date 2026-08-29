import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const MAX_PX = 30
const MIN_PX = 11

export function StatGrid({
  items,
  columns,
  size = 'normal',
  className,
}: {
  items: Array<[string, ReactNode]>
  columns?: number
  size?: 'normal' | 'large'
  className?: string
}) {
  return (
    <div
      className={`stat-grid ${size === 'large' ? 'stat-grid-large' : ''} ${className ?? ''}`}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {size === 'large' ? (
        <LargeValues items={items} />
      ) : (
        items.map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="muted">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))
      )}
    </div>
  )
}

function LargeValues({ items }: { items: Array<[string, ReactNode]> }) {
  const refs = useRef<Array<HTMLSpanElement | null>>([])
  const [size, setSize] = useState(MAX_PX)

  useLayoutEffect(() => {
    let disposed = false
    let raf = 0

    const fit = () => {
      const els = refs.current.filter((el) => el && el.isConnected) as HTMLSpanElement[]
      if (els.length === 0) return
      let maxScroll = 0
      let minClient = Infinity
      for (const el of els) {
        el.style.fontSize = `${MAX_PX}px`
        maxScroll = Math.max(maxScroll, el.scrollWidth)
        const parent = el.parentElement
        if (parent) minClient = Math.min(minClient, parent.clientWidth)
      }
      const px =
        maxScroll <= minClient
          ? MAX_PX
          : Math.min(MAX_PX, Math.max(MIN_PX, (MAX_PX * minClient) / maxScroll))
      for (const el of els) {
        el.style.fontSize = `${px}px`
      }
      setSize(px)
    }

    let lastWidth = -1
    const ro = new ResizeObserver(() => {
      const first = refs.current.find((el) => el && el.isConnected && el.parentElement)
      const width = first?.parentElement?.clientWidth ?? 0
      if (width === lastWidth) return
      lastWidth = width
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(fit)
    })
    for (const el of refs.current) {
      if (el && el.isConnected && el.parentElement) ro.observe(el.parentElement)
    }

    fit()

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!disposed) {
          cancelAnimationFrame(raf)
          raf = requestAnimationFrame(fit)
        }
      })
    }

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [items])

  return (
    <>
      {items.map(([label, value], i) => (
        <div key={label} className="stat-card">
          <div className="muted">{label}</div>
          <div className="value">
            <span
              ref={(el) => {
                refs.current[i] = el
              }}
              style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', fontSize: `${size}px` }}
            >
              {value}
            </span>
          </div>
        </div>
      ))}
    </>
  )
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      {children}
    </div>
  )
}
