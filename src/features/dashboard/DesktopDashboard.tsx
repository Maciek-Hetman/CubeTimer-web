import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useSolves } from '../../contexts/SolvesContext'
import type { ShellOutletContext } from '../../app/AppShell'
import { db } from '../../data/db'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Select } from '../../ui/Select'
import { TimerPage } from '../timer/TimerPage'
import {
  DEFAULT_WIDGETS,
  WIDGET_LABELS,
  WIDGET_TYPES,
  type WidgetInstance,
  type WidgetType,
} from './widgetTypes'
import { WidgetRenderer } from './widgetRegistry'

interface StoredDashboard {
  widgets: WidgetInstance[]
}

export function DesktopDashboard() {
  const { ownerId } = useAuth()
  const { widgetEditing: editing = false } = useOutletContext<ShellOutletContext>() ?? {}
  const [store, setStore] = useState<StoredDashboard>({
    widgets: DEFAULT_WIDGETS,
  })
  const [hydrated, setHydrated] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void db.widgetLayouts.get(ownerId).then((record) => {
      if (cancelled) {
        return
      }
      const layout = record?.layout as StoredDashboard | undefined
      if (layout && Array.isArray(layout.widgets)) {
        const knownWidgets = layout.widgets.filter(isWidgetInstance)
        const widgets = knownWidgets.length > 0 ? knownWidgets : DEFAULT_WIDGETS
        setStore({ widgets })
      } else {
        setStore({ widgets: DEFAULT_WIDGETS })
      }
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
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
    setStore((current) => ({
      widgets: [...current.widgets, { i, type, side }],
    }))
  }

  function removeWidget(id: string) {
    setStore((current) => ({
      widgets: current.widgets.filter((widget) => widget.i !== id),
    }))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    if (activeId === overId) return

    const isActiveColumn = overId === 'left' || overId === 'right'

    setStore((current) => {
      const activeIndex = current.widgets.findIndex((w) => w.i === activeId)
      const overIndex = current.widgets.findIndex((w) => w.i === overId)

      if (activeIndex === -1) return current

      const newWidgets = [...current.widgets]
      const activeWidget = newWidgets[activeIndex]

      if (isActiveColumn) {
        if (activeWidget.side !== overId) {
          const movedWidget = { ...activeWidget, side: overId as 'left' | 'right' }
          newWidgets.splice(activeIndex, 1)
          newWidgets.push(movedWidget)
          return { widgets: newWidgets }
        }
        return current
      }

      if (overIndex !== -1) {
        const overWidget = newWidgets[overIndex]
        if (activeWidget.side !== overWidget.side) {
          newWidgets[activeIndex] = { ...activeWidget, side: overWidget.side }
        }
        return { widgets: arrayMove(newWidgets, activeIndex, overIndex) }
      }

      return current
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const activeId = active.id
    const overId = over.id

    if (activeId !== overId) {
      setStore((current) => {
        const activeIndex = current.widgets.findIndex((w) => w.i === activeId)
        const overIndex = current.widgets.findIndex((w) => w.i === overId)
        if (activeIndex !== -1 && overIndex !== -1) {
          return { widgets: arrayMove(current.widgets, activeIndex, overIndex) }
        }
        return current
      })
    }
  }

  const activeWidget = useMemo(() => {
    if (!activeId) return null
    return store.widgets.find((w) => w.i === activeId)
  }, [activeId, store.widgets])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="desktop-dashboard">
        <WidgetColumn
          side="left"
          store={store}
          editing={editing}
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
          onRemove={removeWidget}
          onAdd={addWidget}
        />
      </div>
      
      <DragOverlay
        dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
        }}
      >
        {activeWidget ? (
          <WidgetCard widget={activeWidget} editing={true} onRemove={() => {}} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function isWidgetInstance(value: unknown): value is WidgetInstance {
  if (!value || typeof value !== 'object') {
    return false
  }
  const widget = value as Partial<WidgetInstance>
  return (
    typeof widget.i === 'string' &&
    typeof widget.type === 'string' &&
    WIDGET_TYPES.includes(widget.type as WidgetType) &&
    (widget.side === 'left' || widget.side === 'right')
  )
}

function WidgetColumn({
  side,
  store,
  editing,
  onRemove,
  onAdd,
}: {
  side: 'left' | 'right'
  store: StoredDashboard
  editing: boolean
  onRemove: (id: string) => void
  onAdd: (type: WidgetType, side: 'left' | 'right') => void
}) {
  const widgets = useMemo(() => store.widgets.filter((widget) => widget.side === side), [side, store.widgets])
  const available = WIDGET_TYPES.filter((type) => !store.widgets.some((widget) => widget.type === type))
  const { settings } = useSettings()
  const scale = settings.widgetScale / 100

  return (
    <aside className="widget-column" style={{ display: 'flex', flexDirection: 'column', gap: '16px', zoom: scale }}>
      {editing ? (
        <Field label="Add widget">
          <Select
            value=""
            disabled={available.length === 0}
            onChange={(value) => {
              if (value) {
                onAdd(value as WidgetType, side)
              }
            }}
            placeholder={available.length === 0 ? 'All widgets added' : 'Choose…'}
            options={available.map((type) => ({
              value: type,
              label: WIDGET_LABELS[type],
            }))}
          />
        </Field>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '200px' }}>
        <SortableContext
          id={side}
          items={widgets.map((widget) => widget.i)}
          strategy={verticalListSortingStrategy}
        >
          {widgets.map((widget) => (
            <SortableWidget key={widget.i} widget={widget} editing={editing} onRemove={onRemove} />
          ))}
        </SortableContext>
      </div>
    </aside>
  )
}

function SortableWidget({ widget, editing, onRemove }: {
  widget: WidgetInstance
  editing: boolean
  onRemove: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.i, disabled: !editing })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <WidgetCard
        widget={widget}
        editing={editing}
        onRemove={onRemove}
        dragHandleAttributes={editing ? attributes : undefined}
        dragHandleListeners={editing ? listeners : undefined}
      />
    </div>
  )
}

function WidgetCard({
  widget,
  editing,
  onRemove,
  dragHandleAttributes,
  dragHandleListeners,
  overlay = false,
}: {
  widget: WidgetInstance
  editing: boolean
  onRemove: (id: string) => void
  dragHandleAttributes?: DraggableAttributes
  dragHandleListeners?: DraggableSyntheticListeners
  overlay?: boolean
}) {
  const { currentSession } = useSolves()

  return (
    <div
      className="widget-grid-item"
      style={{
        margin: 0,
        ...(overlay ? { opacity: 0.9, cursor: 'grabbing', boxShadow: 'var(--shadow-lg)' } : {}),
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3
          className="widget-drag"
          style={{ cursor: editing ? (overlay ? 'grabbing' : 'grab') : 'default' }}
          {...dragHandleAttributes}
          {...dragHandleListeners}
        >
          {widget.type === 'sessionStats' && currentSession?.name
            ? `${WIDGET_LABELS[widget.type]} — ${currentSession.name}`
            : WIDGET_LABELS[widget.type]}
        </h3>
        {editing && !overlay ? (
          <Button type="button" variant="ghost" onClick={() => onRemove(widget.i)}>
            Remove
          </Button>
        ) : null}
      </div>
      <WidgetRenderer type={widget.type} />
    </div>
  )
}
