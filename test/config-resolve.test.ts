import type { UserConfig } from '@unlighthouse/contracts'
import type { Pack } from '@unlighthouse/contracts/packs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isUnlighthouseError } from '@unlighthouse/contracts/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { resolveConfig } from '../packages/unlighthouse/src/config/resolve'

function freshCwd(): string {
  return mkdtempSync(join(tmpdir(), 'unlighthouse-cfg-'))
}

const CI_ENVS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'DRONE',
  'BITBUCKET_BUILD_NUMBER',
  'JENKINS_URL',
  'TEAMCITY_VERSION',
  'APPVEYOR',
]

describe('resolveConfig', () => {
  beforeEach(() => {
    // CI detection in test env would skew throttle assertions — clear them first.
    for (const k of CI_ENVS)
      vi.stubEnv(k, '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('empty overrides + temp cwd → returns validated defaultConfig', async () => {
    const cwd = freshCwd()
    const { config } = await resolveConfig({ cwd })
    expect(config).toBeDefined()
    // routerPrefix normalised to '/'
    expect(config.routerPrefix).toBe('/')
    // chrome defaults applied
    expect(config.chrome).toBeDefined()
    expect(config.lighthouseOptions?.onlyCategories).toBeUndefined()
  })

  it('site = "example.com" → normalised to https://example.com', async () => {
    const cwd = freshCwd()
    const { config } = await resolveConfig({ cwd, overrides: { site: 'example.com' } })
    expect(config.site).toBe('https://example.com')
  })

  it('CI=true env → throttle off', async () => {
    vi.stubEnv('CI', 'true')
    const cwd = freshCwd()
    const { config } = await resolveConfig({ cwd, overrides: { site: 'https://example.com' } })
    expect(config.scanner?.throttle).toBe(false)
  })

  it('D-046: `packs` in overrides is stripped before Zod validation and returned separately', async () => {
    const cwd = freshCwd()
    const fakePack: Pack = {
      name: 'custom',
      description: 'A fixture custom pack.',
      version: '1.0.0',
      reportSchema: z.object({}),
      reconciler: async () => ({}),
      ui: { tab: 'Custom' },
    }
    const { config, packs } = await resolveConfig({
      cwd,
      overrides: { site: 'https://example.com', packs: [fakePack] } as UserConfig,
    })
    // Surfaced separately for the host to merge into the pack registry.
    expect(packs).toEqual([fakePack])
    // Not on the validated config — it's code, not part of the JSON-shaped
    // UnlighthouseConfig schema (D-011).
    expect((config as Record<string, unknown>).packs).toBeUndefined()
  })

  it('invalid site (non-string) throws UnlighthouseError(CONFIG_INVALID)', async () => {
    const cwd = freshCwd()
    try {
      await resolveConfig({
        cwd,
        // intentionally invalid — site must be string|Url per UnlighthouseConfig schema
        overrides: { site: 123 as unknown as string },
      })
      throw new Error('should have thrown')
    }
    catch (err) {
      expect(isUnlighthouseError(err)).toBe(true)
      if (isUnlighthouseError(err))
        expect(err.code).toBe('CONFIG_INVALID')
    }
  })
})

describe('UserConfig.packs type surface (D-046)', () => {
  it('carries a fully-formed pack through the public config type', () => {
    // The regression this guards (an incomplete pack silently typechecking via
    // DeepPartial) is enforced by the `UserConfig` type itself
    // (`Omit<…, 'packs'> & { packs?: Pack[] }` in contracts/types), which keeps
    // `Pack` whole instead of deep-partialing its `reconciler`/`reportSchema`.
    const full: Pack = {
      name: 'demo',
      description: 'demo',
      version: '1.0.0',
      ui: { tab: 'Demo' },
      reportSchema: z.object({}),
      reconciler: async () => ({}),
    }
    const cfg: UserConfig = { packs: [full] }
    expect(cfg.packs).toHaveLength(1)
  })
})
