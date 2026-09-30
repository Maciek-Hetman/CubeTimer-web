import { describe, expect, it, vi } from 'vitest'
import { createAppUpdater, WAKE_WINDOW_MS } from './appUpdate'

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve))
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function setup() {
  const env = {
    time: 0,
    hidden: false,
    editing: false,
    reload: vi.fn(),
  }
  const updater = createAppUpdater({
    now: () => env.time,
    reload: env.reload,
    isHidden: () => env.hidden,
    isEditing: () => env.editing,
  })
  return { env, updater }
}

describe('app updater', () => {
  it('does nothing until an update is ready', () => {
    const { env, updater } = setup()
    updater.navigated()
    updater.hidden()
    updater.woke()
    expect(env.reload).not.toHaveBeenCalled()
  })

  it('reloads right away when the update lands just after the app was opened', () => {
    const { env, updater } = setup()
    env.time = WAKE_WINDOW_MS - 1
    updater.updateReady()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('waits for the next navigation once the user has settled in', async () => {
    const { env, updater } = setup()
    env.time = WAKE_WINDOW_MS
    updater.updateReady()
    expect(env.reload).not.toHaveBeenCalled()
    updater.navigated()
    await nextTask()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload on navigation into a field being typed in', async () => {
    const { env, updater } = setup()
    env.time = WAKE_WINDOW_MS
    updater.updateReady()
    env.editing = true
    updater.navigated()
    await nextTask()
    expect(env.reload).not.toHaveBeenCalled()
  })

  it('reloads while the tab is hidden, but not over a field being typed in', () => {
    const { env, updater } = setup()
    env.time = WAKE_WINDOW_MS
    updater.updateReady()
    env.hidden = true
    env.editing = true
    updater.hidden()
    expect(env.reload).not.toHaveBeenCalled()
    env.editing = false
    updater.hidden()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('treats coming back to the foreground like opening the app', () => {
    const { env, updater } = setup()
    env.time = WAKE_WINDOW_MS * 3
    updater.updateReady()
    updater.woke()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads while held, and applies the update once released', async () => {
    const { env, updater } = setup()
    const release = updater.hold()
    updater.updateReady()
    updater.navigated()
    expect(env.reload).not.toHaveBeenCalled()
    release()
    await settle()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('stays held until every hold is released, even if one is released twice', async () => {
    const { env, updater } = setup()
    const first = updater.hold()
    const second = updater.hold()
    updater.updateReady()
    first()
    first()
    await settle()
    expect(env.reload).not.toHaveBeenCalled()
    second()
    await settle()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('leaves no gap when one hold is handed over to another in the same task', async () => {
    const { env, updater } = setup()
    const solving = updater.hold()
    updater.updateReady()
    solving()
    const saving = updater.hold()
    await settle()
    expect(env.reload).not.toHaveBeenCalled()
    saving()
    await settle()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('runs deferred work right away, or once the last hold is released', async () => {
    const { updater } = setup()
    const now = vi.fn()
    updater.whenNotHeld(now)
    expect(now).toHaveBeenCalledTimes(1)

    const later = vi.fn()
    const release = updater.hold()
    updater.whenNotHeld(later)
    expect(later).not.toHaveBeenCalled()
    release()
    await settle()
    expect(later).toHaveBeenCalledTimes(1)
  })

  it('drops deferred work when the update reload wins', async () => {
    const { env, updater } = setup()
    const chunkReload = vi.fn()
    const release = updater.hold()
    updater.updateReady()
    updater.whenNotHeld(chunkReload)
    release()
    await settle()
    expect(env.reload).toHaveBeenCalledTimes(1)
    expect(chunkReload).not.toHaveBeenCalled()
  })

  it('reloads only once', () => {
    const { env, updater } = setup()
    updater.updateReady()
    updater.navigated()
    updater.woke()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })
})
