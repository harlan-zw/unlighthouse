import type { Storage, UnlighthouseCore } from '@unlighthouse/contracts'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { ScanId, Url } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { UnlighthouseConfigSchema } from '@unlighthouse/contracts/config'
import { parseScanId, parseUrl } from '@unlighthouse/contracts/types/atoms'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'

export function testScanId(value: string): ScanId {
  return parseScanId(value)
}

export function testUrl(value: string): Url {
  return parseUrl(value)
}

export function testConfig(input: UnlighthouseConfig = {}): UnlighthouseConfig {
  return UnlighthouseConfigSchema.parse({
    site: 'https://example.com',
    routerPrefix: '/',
    scanner: {},
    ...input,
  })
}

export function testCore(overrides: Partial<UnlighthouseCore> = {}): UnlighthouseCore {
  return {
    hooks: undefined,
    session: () => null,
    run: () => {
      throw new Error('test core run() was not stubbed')
    },
    ...overrides,
  }
}

export function testHandlerCtx(storage: Storage, overrides: Partial<HandlerCtx> = {}): HandlerCtx {
  return {
    storage,
    core: testCore(),
    auditor: createMockAuditor(),
    config: testConfig(),
    version: 'test',
    ...overrides,
  }
}
