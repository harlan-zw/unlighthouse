import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProgressBox } from '../src/util/progressBox'

function captureStdout() {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  }) as typeof process.stdout.write)
  return { writes, spy }
}

describe('progressBox', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears the display without writing a completion line', () => {
    const { writes } = captureStdout()

    const progressBox = createProgressBox()
    progressBox.update({ completedTasks: 1, totalTasks: 2, timeElapsed: 1000 })
    writes.length = 0

    progressBox.clear()

    expect(writes.join('')).not.toContain('Scan completed!')
  })

  it('unregisters the exit handler so a clean exit prints no cancel message', () => {
    const { writes } = captureStdout()

    const progressBox = createProgressBox()
    progressBox.update({ completedTasks: 1, totalTasks: 2, timeElapsed: 1000 })
    progressBox.clear()
    writes.length = 0

    // simulate a clean process exit while the capture is still active
    process.emit('exit', 0)

    expect(writes.join('')).not.toContain('Canceled')
  })

  it('is safe to clear before the spinner has started', () => {
    const { writes } = captureStdout()

    const progressBox = createProgressBox()
    expect(() => progressBox.clear()).not.toThrow()
    expect(writes.join('')).not.toContain('Scan completed!')
  })
})
