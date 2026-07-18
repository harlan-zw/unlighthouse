import { describe, expect, it, vi } from 'vitest'
import { killChromePidIfAlive } from '../src/auditors/chrome-process'

describe('chrome process cleanup', () => {
  it('force-kills the exact launched PID when it remains alive', () => {
    const kill = vi.fn(() => true)

    expect(killChromePidIfAlive(42, kill)).toBe(true)
    expect(kill.mock.calls).toEqual([
      [42, 0],
      [42, 'SIGKILL'],
    ])
  })

  it('treats an already-exited process as clean', () => {
    const missing = Object.assign(new Error('missing'), { code: 'ESRCH' })
    const kill = vi.fn(() => { throw missing })

    expect(killChromePidIfAlive(42, kill)).toBe(false)
    expect(kill).toHaveBeenCalledOnce()
  })

  it('surfaces unexpected process errors', () => {
    const denied = Object.assign(new Error('denied'), { code: 'EPERM' })

    expect(() => killChromePidIfAlive(42, () => { throw denied })).toThrow(denied)
  })
})
