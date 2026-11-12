/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import { DesktopDashboard } from './DesktopDashboard'
import type { WidgetInstance } from './widgetTypes'

const auth = vi.hoisted(() => ({ ownerId: '' }))

vi.mock('../timer/TimerPage', () => ({ TimerPage: () => <div>timer</div> }))
vi.mock('./widgetRegistry', () => ({
  WidgetRenderer: ({ type }: { type: string }) => <div data-testid="widget">{type}</div>,
}))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ ownerId: auth.ownerId }) }))
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { widgetScale: 100 } }),
}))
vi.mock('../../contexts/SolvesContext', () => ({ useSolves: () => ({ currentSession: null }) }))

const layoutA: WidgetInstance[] = [{ i: 'recentSolves', type: 'recentSolves', side: 'left' }]
const layoutB: WidgetInstance[] = [{ i: 'personalBests', type: 'personalBests', side: 'right' }]

function record(ownerId: string, widgets: WidgetInstance[]) {
  return { ownerId, widgets: widgets.map((w) => w.type), layout: { widgets } }
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DesktopDashboard />
    </MemoryRouter>,
  )
}

describe('DesktopDashboard persistence', () => {
  beforeEach(async () => {
    cleanup()
    await db.widgetLayouts.clear()
    auth.ownerId = ''
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('does not write the previous owner layout under a new owner', async () => {
    await db.widgetLayouts.put(record('user-a', layoutA))
    await db.widgetLayouts.put(record('user-b', layoutB))
    const put = vi.spyOn(db.widgetLayouts, 'put')

    auth.ownerId = 'user-a'
    const view = renderDashboard()
    await waitFor(() => {
      expect(screen.getAllByTestId('widget').map((el) => el.textContent)).toEqual(['recentSolves'])
    })

    auth.ownerId = 'user-b'
    view.rerender(
      <MemoryRouter>
        <DesktopDashboard />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getAllByTestId('widget').map((el) => el.textContent)).toEqual(['personalBests'])
    })
    // Let any trailing save effect flush.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const badWrite = put.mock.calls.find(
      ([row]) => row.ownerId === 'user-b' && row.widgets.includes('recentSolves'),
    )
    expect(badWrite).toBeUndefined()
    expect(await db.widgetLayouts.get('user-b')).toEqual(record('user-b', layoutB))
    expect(await db.widgetLayouts.get('user-a')).toEqual(record('user-a', layoutA))
  })

  it('does not load or save a row for an empty owner id', async () => {
    const put = vi.spyOn(db.widgetLayouts, 'put')
    renderDashboard()
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(put).not.toHaveBeenCalled()
    expect(await db.widgetLayouts.get('')).toBeUndefined()
  })
})
