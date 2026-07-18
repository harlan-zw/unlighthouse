import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { commands } from '@unlighthouse/contracts/commands'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { createCommandExecutor, createHandlers } from '@unlighthouse/core/api/handlers'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it, vi } from 'vitest'
import { testHandlerCtx } from '../../../test/helpers/contracts'

function createCtx(): HandlerCtx {
  return testHandlerCtx(memoryStorage())
}

describe('command executor', () => {
  it('validates input before resolving the Host context', async () => {
    const resolveCtx = vi.fn(createCtx)
    const executor = createCommandExecutor({ handlers: createHandlers() })

    await expect(executor.execute('scan.cancel', {}, resolveCtx)).rejects.toMatchObject({
      code: 'INPUT_INVALID',
    })
    expect(resolveCtx).not.toHaveBeenCalled()
  })

  it('resolves context once and invokes the selected Command', async () => {
    const handlers = createHandlers()
    const run = vi.fn(handlers.health.run)
    handlers.health = { command: commands.health, run }
    const resolveCtx = vi.fn(createCtx)
    const executor = createCommandExecutor({ handlers })

    const result = await executor.execute('health', {}, resolveCtx)

    expect(result).toMatchObject({ ok: true })
    expect(resolveCtx).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledOnce()
  })

  it('preserves Domain failures without transport mapping', async () => {
    const handlers = createHandlers()
    const failure = new UnlighthouseError({ code: 'NOT_SUPPORTED', message: 'not here' })
    handlers.health = {
      command: commands.health,
      run: async () => { throw failure },
    }
    const executor = createCommandExecutor({ handlers })

    await expect(executor.execute('health', {}, createCtx())).rejects.toBe(failure)
  })
})
