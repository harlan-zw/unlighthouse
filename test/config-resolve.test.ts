import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isUnlighthouseError } from '../packages/contracts/src/errors'
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
