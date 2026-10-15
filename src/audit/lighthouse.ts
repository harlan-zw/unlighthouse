import type { Config as LighthouseConfig, Flags } from 'lighthouse'
import defaultConfig from 'lighthouse/core/config/default-config.js'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import type { AuditJob } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'

const PLUGIN_NAME = /^(?:@[a-z0-9][\w.-]*\/)?lighthouse-plugin-[a-z0-9][\w.-]*$/

export function installedCategories(): string[] {
  return Object.keys(defaultConfig.categories ?? {})
}

export function installedAuditIds(): string[] {
  return (defaultConfig.audits ?? []).map((audit) => {
    const path = typeof audit === 'string' ? audit : 'path' in audit && typeof audit.path === 'string' ? audit.path : ''
    return path.slice(path.lastIndexOf('/') + 1)
  }).filter(Boolean)
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = current
  }
  return previous[b.length]!
}

export function closestMatch(value: string, candidates: string[]): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const d = distance(value, candidate)
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }
  return best
}

export function isPluginName(name: string): boolean {
  return PLUGIN_NAME.test(name)
}

export function resolvePlugins(plugins: string[], cwd: string): string[] {
  return plugins.map((name) => {
    if (!isPluginName(name))
      throw new UnlighthouseError('INVALID_CONFIG', `Lighthouse plugin "${name}" must be an npm package named lighthouse-plugin-* or @scope/lighthouse-plugin-*`)
    try {
      return Bun.resolveSync(name, cwd)
    }
    catch {
      throw new UnlighthouseError('INVALID_CONFIG', `Lighthouse plugin "${name}" is not installed in ${cwd}. Install it in your project (bun add -d ${name}); plugins are resolved from the project directory, not from Unlighthouse.`)
    }
  })
}

export function lighthouseConfig(job: Pick<AuditJob, 'device' | 'lighthouse'>): LighthouseConfig | undefined {
  const base = job.device === 'desktop' ? desktopConfig : undefined
  const settings = job.lighthouse?.settings
  const plugins = job.lighthouse?.plugins
  if (!settings && !plugins?.length)
    return base
  const config: LighthouseConfig = { ...(base ?? { extends: 'lighthouse:default' }) }
  if (settings)
    config.settings = { ...base?.settings, ...settings }
  if (plugins?.length)
    config.plugins = [...plugins]
  return config
}

export function lighthouseFlags(job: Pick<AuditJob, 'categories' | 'throttling' | 'userAgent' | 'lighthouse'>): Flags {
  const flags: Flags = {
    output: 'json',
    logLevel: 'error',
  }
  const options = job.lighthouse
  if (options?.onlyAudits?.length)
    flags.onlyAudits = [...options.onlyAudits]
  else
    flags.onlyCategories = [...job.categories, ...(options?.plugins ?? [])]
  if (options?.skipAudits?.length)
    flags.skipAudits = [...options.skipAudits]
  if (job.throttling === 'devtools') {
    flags.throttlingMethod = 'devtools'
  }
  else if (job.throttling === 'none') {
    flags.throttlingMethod = 'provided'
    flags.throttling = {
      rttMs: 0,
      throughputKbps: 0,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
      cpuSlowdownMultiplier: 1,
    }
  }
  else {
    flags.throttlingMethod = 'simulate'
  }
  if (job.userAgent)
    flags.emulatedUserAgent = job.userAgent
  return flags
}
