import { useEffect, useMemo, useState } from 'react'
import GridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { useOutletContext } from 'react-router-dom'
import { useApp } from '../../app/AppProviders'
import type { ShellOutletContext } from '../../app/AppShell'
import { db } from '../../data/db'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { TimerPage } from '../timer/TimerPage'
import {
  AVERAGES_MIN_H,
  DEFAULT_LAYOUTS,
  DEFAULT_WIDGETS,
  WIDGET_LABELS,
  WIDGET_TYPES,
  renderWidget,
  type WidgetInstance,
  type WidgetType,
} from './widgetRegistry'

interface StoredDashboard {
  widgets: WidgetInstance[]
  layouts: Record<'left' | 'right', Layout>
}

function ensureAveragesHeight(widgets: WidgetInstance[], layouts: StoredDashboard['layouts']): StoredDashboard['layouts'] {
  const averagesIds = new Set(widgets.filter((widget) => widget.type === 'averages').map((widget) => widget.i))
  const bump = (layout: Layout) =>
    layout.map((item) => {
      if (!averagesIds.has(item.i)) {
        return item
      }
      const minH = Math.max(item.minH ?? 0, AVERAGES_MIN_H)
      return { ...item, minH, h: Math.max(item.h, minH) }
    })
  return { left: bump(layouts.left), right: bump(layouts.right) }
}

export function DesktopDashboard() {
  const { ownerId } = useApp()
  const { widgetEditing: editing = false } = useOutletContext<ShellOutletContext>() ?? {}
  const [store, setStore] = useState<StoredDashboard>({
    widgets: DEFAULT_WIDGETS,
    layouts: DEFAULT_LAYOUTS,
  })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(false)
    void db.widgetLayouts.get(ownerId).then((record) => {
      const layout = record?.layout as StoredDashboard | undefined
      if (layout?.widgets && layout.layouts) {
        const known = new Set(WIDGET_TYPES)
        const knownWidgets = layout.widgets.filter((widget) => known.has(widget.type))
        const widgets = knownWidgets.length > 0 ? knownWidgets : DEFAULT_WIDGETS
        const layouts = {
          left: layout.layouts.left ?? DEFAULT_LAYOUTS.left,
          right: layout.layouts.right ?? DEFAULT_LAYOUTS.right,
        }
        setStore({
          widgets,
          layouts: ensureAveragesHeight(widgets, layouts),
        })
      }
      setHydrated(true)
    })
  }, [ownerId])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    void db.widgetLayouts.put({
      ownerId,
      widgets: store.widgets.map((widget) => widget.type),
      layout: store,
    })
  }, [hydrated, ownerId, store])

  function addWidget(type: WidgetType, side: 'left' | 'right') {
    if (store.widgets.some((widget) => widget.type === type)) {
      return
    }
    const i = `${type}-${crypto.randomUUID().slice(0, 8)}`
    const height = type === 'averages' ? AVERAGES_MIN_H : 4
    const minH = type === 'averages' ? AVERAGES_MIN_H : 3
    setStore((current) => ({
      widgets: [...current.widgets, { i, type, side }],
      layouts: {
        ...current.layouts,
        [side]: [...current.layouts[side], { i, x: 0, y: Infinity, w: 1, h: height, minH }],
      },
    }))
  }

  function removeWidget(id: string) {
    setStore((current) => ({
      widgets: current.widgets.filter((widget) => widget.i !== id),
      layouts: {
        left: current.layouts.left.filter((item) => item.i !== id),
        right: current.layouts.right.filter((item) => item.i !== id),
      },
    }))
  }

  return (
    <div className="desktop-dashboard">
      <WidgetColumn
        side="left"
        store={store}
        editing={editing}
        onLayout={(layout) => setStore((current) => ({ ...current, layouts: { ...current.layouts, left: layout } }))}
        onRemove={removeWidget}
        onAdd={addWidget}
      />
      <section className="desktop-center">
        <TimerPage variant="desktop" />
      </section>
      <WidgetColumn
        side="right"
        store={store}
        editing={editing}
        onLayout={(layout) => setStore((current) => ({ ...current, layouts: { ...current.layouts, right: layout } }))}
        onRemove={removeWidget}
        onAdd={addWidget}
      />
    </div>
  )
}

function WidgetColumn({
  side,
  store,
  editing,
  onLayout,
  onRemove,
  onAdd,
}: {
  side: 'left' | 'right'
  store: StoredDashboard
  editing: boolean
  onLayout: (layout: Layout) => void
  onRemove: (id: string) => void
  onAdd: (type: WidgetType, side: 'left' | 'right') => void
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const widgets = useMemo(() => store.widgets.filter((widget) => widget.side === side), [side, store.widgets])
  const layout = store.layouts[side]
  const available = WIDGET_TYPES.filter((type) => !store.widgets.some((widget) => widget.type === type))

  return (
    <aside ref={containerRef} className="widget-column">
      {editing ? (
        <Field label="Add widget">
          <select
            defaultValue=""
            disabled={available.length === 0}
            onChange={(event) => {
              const value = event.target.value as WidgetType | ''
              if (value) {
                onAdd(value, side)
                event.target.value = ''
              }
            }}
          >
            <option value="">{available.length === 0 ? 'All widgets added' : 'Choose…'}</option>
            {available.map((type) => (
              <option key={type} value={type}>
                {WIDGET_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {mounted ? (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 1, rowHeight: 48, margin: [8, 8] }}
          dragConfig={{ enabled: editing, handle: '.widget-drag' }}
          resizeConfig={{ enabled: editing }}
          onLayoutChange={onLayout}
        >
          {widgets.map((widget) => (
            <div key={widget.i} className="widget-grid-item">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 className="widget-drag" style={{ cursor: editing ? 'grab' : 'default' }}>
                  {WIDGET_LABELS[widget.type]}
                </h3>
                {editing ? (
                  <Button type="button" variant="ghost" onClick={() => onRemove(widget.i)}>
                    Remove
                  </Button>
                ) : null}
              </div>
              {renderWidget(widget.type)}
            </div>
          ))}
        </GridLayout>
      ) : (
        <div className="stack">
          {[0, 1].map((index) => (
            <div key={index} className="widget-grid-item" style={{ minHeight: 160 }}>
              <p className="muted">Loading widgets…</p>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
