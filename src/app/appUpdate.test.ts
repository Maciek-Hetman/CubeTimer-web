import { describe, expect, it, vi } from 'vitest'
import { createAppUpdater, WAKE_WINDOW_MS } from './appUpdate'

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

  it('waits for the next navigation once the user has settled in', () => {
    const { env, updater } = setup()
    env.time = WAKE_WINDOW_MS
    updater.updateReady()
    expect(env.reload).not.toHaveBeenCalled()
    updater.navigated()
    expect(env.reload).toHaveBeenCalledTimes(1)
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

  it('never reloads while held, and applies the update once released', () => {
    const { env, updater } = setup()
    const release = updater.hold()
    updater.updateReady()
    updater.navigated()
    expect(env.reload).not.toHaveBeenCalled()
    release()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('stays held until every hold is released, even if one is released twice', () => {
    const { env, updater } = setup()
    const first = updater.hold()
    const second = updater.hold()
    updater.updateReady()
    first()
    first()
    expect(env.reload).not.toHaveBeenCalled()
    second()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('reloads only once', () => {
    const { env, updater } = setup()
    updater.updateReady()
    updater.navigated()
    updater.woke()
    expect(env.reload).toHaveBeenCalledTimes(1)
  })
})
