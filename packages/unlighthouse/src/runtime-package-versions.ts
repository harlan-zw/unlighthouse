import { readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'

export const runtimePackageNames: readonly string[] = [
  'lighthouse',
  'puppeteer-core',
  '@puppeteer/browsers',
  '@libsql/client',
  '@modelcontextprotocol/sdk',
  '@unlighthouse/ui',
  '@unlighthouse/lighthouse-runtime',
  'unstorage',
  'aws4fetch',
  'jiti',
  '@lhci/utils',
]

export function installedRuntimePackageVersion(name: string): string {
  if (!runtimePackageNames.includes(name))
    throw new Error(`Dependency has no version pin: ${name}`)

  const manifest = findPackageJSON(name, import.meta.url)
  if (!manifest)
    throw new Error(`Cannot resolve runtime version: ${name}`)
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'))
  if (typeof version !== 'string' || !version)
    throw new Error(`Cannot resolve runtime version: ${name}`)
  return version
}
