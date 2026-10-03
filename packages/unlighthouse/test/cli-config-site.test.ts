import { runCli } from 'unlighthouse/cli'
import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ start: vi.fn(), complete: undefined as undefined | ((payload: unknown) => Promise<void>), success: vi.fn(), config: { site: 'https://example.com', urls: undefined, server: { open: false } } }))
vi.mock('@unlighthouse/core/logger', async importOriginal => ({
  ...await importOriginal<object>(),
  createLogger: () => {
    const logger = { debug: vi.fn(), info: vi.fn(), success: state.success, withTag: () => logger }
    return logger
  },
}))
vi.mock('../src/index.ts', () => ({
  createUnlighthouseHost: async ({ userConfig }: { userConfig: { site?: string } }) => ({
    resolvedConfig: { ...state.config, site: userConfig.site ?? state.config.site },
    runtimeSettings: { clientUrl: 'http://localhost:5678' },
    setServerContext: async () => {},
    start: state.start,
    hooks: { hook: (event: string, callback: (payload: unknown) => Promise<void>) => {
      if (event === 'scan:complete')
        state.complete = callback
    } },
    handlerCtx: { storage: { sites: { create: async () => {} } } },
  }),
}))
vi.mock('listhen', () => ({ listen: async () => ({ url: 'http://localhost:5678', server: { close: () => {} } }) }))
vi.mock('../src/cli/util', async importOriginal => ({
  ...await importOriginal<object>(),
  validateHost: async () => {},
  validateOptions: () => {},
}))

afterEach(() => vi.restoreAllMocks())

it('starts a scan using the site loaded from config without a --site flag', async () => {
  vi.spyOn(process, 'on').mockReturnValue(process)
  state.start.mockImplementation(async () => {
    await state.complete?.({ scanId: 'scan', summary: { completed: 1 } })
    return { scanId: 'scan' }
  })
  await runCli({ argv: ['--config-file', 'custom.config.ts'], env: {} })
  expect(state.start).toHaveBeenCalledOnce()
  expect(state.success).toHaveBeenCalledWith(expect.stringContaining('Scan finished: 1 routes'))
})
