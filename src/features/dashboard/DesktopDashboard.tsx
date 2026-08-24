import { useEffect, useMemo, useState } from 'react'
import GridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { useApp } from '../../app/AppProviders'
import { db } from '../../data/db'
import { TimerPage } from '../timer/TimerPage'
import {
  DEFAULT_LAYOUTS,
  DEFAULT_WIDGETS,
  WIDGET_LABELS,
  WIDGET_TYPES,
  renderWidget,
  type WidgetInstance,
  type WidgetType,
} from './widgetRegistry'
import { Link } from 'react-router-dom'

interface StoredDashboard {
  widgets: WidgetInstance[]
  layouts: Record<'left' | 'right', Layout>
}

export function DesktopDashboard() {
  const { ownerId, user, logout } = useApp()
  const [editing, setEditing] = useState(false)
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
        const widgets = layout.widgets.filter((widget) => known.has(widget.type))
        setStore({
          widgets: widgets.length > 0 ? widgets : DEFAULT_WIDGETS,
          layouts: {
            left: layout.layouts.left ?? DEFAULT_LAYOUTS.left,
            right: layout.layouts.right ?? DEFAULT_LAYOUTS.right,
          },
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
    const i = `${type}-${crypto.randomUUID().slice(0, 8)}`
    setStore((current) => ({
      widgets: [...current.widgets, { i, type, side }],
      layouts: {
        ...current.layouts,
        [side]: [...current.layouts[side], { i, x: 0, y: Infinity, w: 1, h: 4, minH: 3 }],
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
        <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <nav className="row wrap">
            <Link className="btn ghost" to="/">
              Timer
            </Link>
            <Link className="btn ghost" to="/stats">
              Stats
            </Link>
            <Link className="btn ghost" to="/settings">
              Settings
            </Link>
          </nav>
          <div className="row wrap">
            {user ? (
              <button type="button" className="btn ghost" onClick={() => void logout()}>
                Log out
              </button>
            ) : (
              <Link className="btn ghost" to="/login">
                Sign in
              </Link>
            )}
            <button type="button" className="btn" onClick={() => setEditing((value) => !value)}>
              {editing ? 'Done' : 'Edit widgets'}
            </button>
          </div>
        </div>
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

  return (
    <aside ref={containerRef} style={{ minWidth: 0 }}>
      {editing ? (
        <label className="field" style={{ marginBottom: 8 }}>
          Add widget
          <select
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value as WidgetType | ''
              if (value) {
                onAdd(value, side)
                event.target.value = ''
              }
            }}
          >
            <option value="">Choose…</option>
            {WIDGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {WIDGET_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
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
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 className="widget-drag" style={{ cursor: editing ? 'grab' : 'default' }}>
                  {WIDGET_LABELS[widget.type]}
                </h3>
                {editing ? (
                  <button type="button" className="btn ghost" onClick={() => onRemove(widget.i)}>
                    Remove
                  </button>
                ) : null}
              </div>
              {renderWidget(widget.type)}
            </div>
          ))}
        </GridLayout>
      ) : null}
    </aside>
  )
}
