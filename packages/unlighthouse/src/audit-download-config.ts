import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface AuditArtifact {
  version: string
  sha256: string
}

declare const __UNLIGHTHOUSE_AUDIT_ARTIFACT__: AuditArtifact

export function auditArtifactPin(): AuditArtifact {
  if (typeof __UNLIGHTHOUSE_AUDIT_ARTIFACT__ !== 'undefined')
    return __UNLIGHTHOUSE_AUDIT_ARTIFACT__
  // Source execution reads the same generated manifest used by the CLI build.
  const require = createRequire(import.meta.url)
  return JSON.parse(readFileSync(require.resolve('@unlighthouse/lighthouse-runtime/manifest'), 'utf8')) as AuditArtifact
}

/** Preserve npm's registry, credentials, proxy, and certificate handling when configured. */
export function hasNpmDownloadConfig(env: NodeJS.ProcessEnv): boolean {
  const config = Object.fromEntries(Object.entries(env).map(([name, value]) => [name.toLowerCase(), value]))
  if (['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'].some(name => env[name]))
    return true
  if (Object.entries(config).some(([name, value]) => value && /^npm_config_.*(?:registry|proxy|ca|cafile|cert|strict_ssl|auth|token|key)$/i.test(name)))
    return true
  if (existsSync(config.npm_config_userconfig ?? join(homedir(), '.npmrc')) || existsSync(config.npm_config_globalconfig ?? join(dirname(process.execPath), '../etc/npmrc')))
    return true
  for (const root of [process.cwd(), env.INIT_CWD, config.npm_config_local_prefix].filter((path): path is string => !!path)) {
    let directory = root
    while (true) {
      if (existsSync(join(directory, '.npmrc')))
        return true
      const parent = dirname(directory)
      if (parent === directory)
        break
      directory = parent
    }
  }
  return false
}
