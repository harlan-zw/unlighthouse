import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { hasNpmDownloadConfig, readAuditArtifactPin } from '../src/audit-download-config'

it('reports the build command when a source runtime manifest is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-pin-'))
  try {
    expect(() => readAuditArtifactPin(join(root, 'manifest.json'))).toThrow('pnpm --filter @unlighthouse/lighthouse-runtime build')
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ version: '1.0.0', sha256: 'a'.repeat(64) }))
    expect(readAuditArtifactPin(join(root, 'manifest.json'))).toEqual({ version: '1.0.0', sha256: 'a'.repeat(64) })
    await writeFile(join(root, 'manifest.json'), 'null')
    expect(() => readAuditArtifactPin(join(root, 'manifest.json'))).toThrow('Invalid audit runtime pin')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('preserves global npm configuration from Windows APPDATA and explicit prefixes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-npm-config-'))
  const context = { cwd: root, home: root, execPath: join(root, 'node/node.exe'), platform: 'win32' as const }
  try {
    await writeFile(join(root, 'package.json'), '{}')
    const appData = join(root, 'AppData/Roaming')
    const global = join(appData, 'npm/etc')
    await mkdir(global, { recursive: true })
    await writeFile(join(global, 'npmrc'), 'proxy=https://proxy.example.com\n')
    expect(hasNpmDownloadConfig({ APPDATA: appData }, context)).toBe(true)
    const prefix = join(root, 'custom-prefix')
    await mkdir(join(prefix, 'etc'), { recursive: true })
    await writeFile(join(prefix, 'etc/npmrc'), 'registry=https://mirror.example.com\n')
    expect(hasNpmDownloadConfig({ NPM_CONFIG_PREFIX: prefix }, context)).toBe(true)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
