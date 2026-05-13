import { describe, expect, it, vi } from 'vitest'
import { createAdapterHooks } from '../packages/contracts/src/hooks/adapter'

interface Events extends Record<string, (...args: any[]) => unknown | Promise<unknown>> {
  foo: (payload: { n: number }) => void
  bar: (a: string, b: number) => Promise<void>
}

describe('createAdapterHooks', () => {
  it('on(event) → emit(event, payload) calls handler with payload', async () => {
    const hooks = createAdapterHooks<Events>()
    const handler = vi.fn()
    hooks.on('foo', handler)
    await hooks.emit('foo', { n: 1 })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ n: 1 })
  })

  it('disposer returned by on() removes the handler', async () => {
    const hooks = createAdapterHooks<Events>()
    const handler = vi.fn()
    const dispose = hooks.on('foo', handler)
    dispose()
    await hooks.emit('foo', { n: 1 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('any(handler) receives every event with (eventName, ...args)', async () => {
    const hooks = createAdapterHooks<Events>()
    const tap = vi.fn()
    hooks.any(tap)
    await hooks.emit('foo', { n: 2 })
    await hooks.emit('bar', 'hello', 7)
    expect(tap).toHaveBeenCalledTimes(2)
    expect(tap).toHaveBeenNthCalledWith(1, 'foo', { n: 2 })
    expect(tap).toHaveBeenNthCalledWith(2, 'bar', 'hello', 7)
  })

  it('concurrent emits to multiple handlers all run (Promise.all semantics)', async () => {
    const hooks = createAdapterHooks<Events>()
    const order: string[] = []
    let resolveA: () => void
    let resolveB: () => void
    const pa = new Promise<void>((r) => { resolveA = r })
    const pb = new Promise<void>((r) => { resolveB = r })

    hooks.on('foo', async () => {
      await pa
      order.push('a')
    })
    hooks.on('foo', async () => {
      await pb
      order.push('b')
    })

    const emitted = hooks.emit('foo', { n: 0 })
    // resolve B before A — should still wait for both
    resolveB!()
    resolveA!()
    await emitted
    expect(order.sort()).toEqual(['a', 'b'])
  })
})
