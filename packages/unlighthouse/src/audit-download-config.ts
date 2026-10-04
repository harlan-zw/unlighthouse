import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface AuditArtifact {
  version: string
  sha256: string
}

export function parseAuditArtifact(value: unknown): AuditArtifact {
  if (!value || typeof value !== 'object' || !('version' in value) || !('sha256' in value)
    || typeof value.version !== 'string' || typeof value.sha256 !== 'string'
    || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(value.version) || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error('Invalid audit runtime pin. Rebuild the audit runtime.')
  }
  return { version: value.version, sha256: value.sha256 }
}

export function readAuditArtifactPin(path: string): AuditArtifact {
  const source = (() => {
    try { return readFileSync(path, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new Error('Audit runtime build is missing. Run pnpm --filter @unlighthouse/lighthouse-runtime build.')
      throw error
    }
  })()
  return parseAuditArtifact(JSON.parse(source))
}

declare const __UNLIGHTHOUSE_AUDIT_ARTIFACT__: AuditArtifact

export function auditArtifactPin(): AuditArtifact {
  if (typeof __UNLIGHTHOUSE_AUDIT_ARTIFACT__ !== 'undefined')
    return __UNLIGHTHOUSE_AUDIT_ARTIFACT__
  // Source execution reads the same generated manifest used by the CLI build.
  const require = createRequire(import.meta.url)
  return readAuditArtifactPin(join(dirname(require.resolve('@unlighthouse/lighthouse-runtime/package.json')), 'dist/manifest.json'))
}

interface NpmConfigContext {
  cwd: string
  home: string
  execPath: string
  platform: NodeJS.Platform
}

export function npmProjectConfig(env: NodeJS.ProcessEnv, cwd = process.cwd()): string | undefined {
  const config = Object.fromEntries(Object.entries(env).map(([name, value]) => [name.toLowerCase(), value]))
  for (const root of [config.npm_config_local_prefix, env.INIT_CWD, cwd].filter((path): path is string => !!path)) {
    let directory = root
    while (true) {
      const file = join(directory, '.npmrc')
      if (existsSync(file))
        return file
      // npm reads project config at the package root, not every ancestor's user config.
      if (existsSync(join(directory, 'package.json')) || existsSync(join(directory, 'node_modules')))
        break
      const parent = dirname(directory)
      if (parent === directory)
        break
      directory = parent
    }
  }
}

/** Preserve npm's registry, credentials, proxy, and certificate handling when configured. */
export function hasNpmDownloadConfig(env: NodeJS.ProcessEnv, context: NpmConfigContext = { cwd: process.cwd(), home: homedir(), execPath: process.execPath, platform: process.platform }): boolean {
  const config = Object.fromEntries(Object.entries(env).map(([name, value]) => [name.toLowerCase(), value]))
  if (['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].some(name => env[name]))
    return true
  if (Object.entries(config).some(([name, value]) => value && /^npm_config_.*(?:registry|proxy|ca|cafile|cert|strict_ssl|auth|token|key)$/i.test(name)))
    return true
  const prefix = config.npm_config_prefix ?? (context.platform === 'win32'
    ? config.appdata ? join(config.appdata, 'npm') : dirname(context.execPath)
    : dirname(dirname(context.execPath)))
  if (existsSync(config.npm_config_userconfig ?? join(context.home, '.npmrc')) || existsSync(config.npm_config_globalconfig ?? join(prefix, 'etc/npmrc')))
    return true
  return !!npmProjectConfig(env, context.cwd)
}
