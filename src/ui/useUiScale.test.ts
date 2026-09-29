/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { scalePx, useUiScale } from './useUiScale'

function setRootFontSize(value: string) {
  document.documentElement.style.fontSize = value
}

afterEach(() => {
  cleanup()
  document.documentElement.style.fontSize = ''
})

describe('useUiScale', () => {
  it('reports the root font size relative to 16px', () => {
    setRootFontSize('24px')
    const { result } = renderHook(() => useUiScale())
    expect(result.current).toBe(1.5)
  })

  it('updates when a resize changes the root font size', () => {
    setRootFontSize('16px')
    const { result } = renderHook(() => useUiScale())
    expect(result.current).toBe(1)

    act(() => {
      setRootFontSize('32px')
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(2)
  })

  it('rereads the root font size after every subscriber has gone', () => {
    setRootFontSize('16px')
    renderHook(() => useUiScale()).unmount()

    setRootFontSize('20px')
    const { result } = renderHook(() => useUiScale())
    expect(result.current).toBe(1.25)
  })
})

describe('scalePx', () => {
  it('scales and rounds to whole pixels', () => {
    expect(scalePx(40, 1)).toBe(40)
    expect(scalePx(40, 1.3333)).toBe(53)
  })
})
