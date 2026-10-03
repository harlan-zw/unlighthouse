import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { extractAuditRuntime } from '../../unlighthouse/src/compact-runtime'
import { buildAuditArchive } from '../scripts/archive'

it('preserves conflicting transitive versions and adjacent runtime assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-build-'))
  const source = join(root, 'source')
  async function pkg(path: string, name: string, dependencies: Record<string, string>, code: string) {
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', main: 'index.mjs', dependencies }))
    await writeFile(join(path, 'index.mjs'), code)
  }
  try {
    const first = join(source, 'node_modules', 'first')
    const second = join(source, 'node_modules', 'second')
    await pkg(first, 'first', { shared: '1.0.0' }, 'import {value} from "shared"; export const audit = () => value')
    await pkg(second, 'second', { shared: '2.0.0' }, 'import {value} from "shared"; export const audit = () => value')
    await pkg(join(source, 'node_modules', 'shared'), 'shared', {}, 'import {readFileSync} from "node:fs"; export const value = JSON.parse(readFileSync(new URL("data.json", import.meta.url))).value')
    await writeFile(join(source, 'node_modules/shared/data.json'), JSON.stringify({ value: 'first' }))
    await pkg(join(second, 'node_modules', 'shared'), 'shared', {}, 'export const value = "second"')
    const archive = join(root, 'runtime.zip')
    await buildAuditArchive([first, second], archive)
    const resolve = await extractAuditRuntime(join(root, 'consumer'), () => readFile(archive))
    expect((await import(resolve('first'))).audit()).toBe('first')
    expect((await import(resolve('second'))).audit()).toBe('second')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
