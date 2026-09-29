import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prepareOutputDir } from '../src/util/outputDir'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'unlighthouse-output-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('prepareOutputDir', () => {
  it('refuses to clear a folder that holds other files', async () => {
    const project = join(root, 'project')
    await mkdir(join(project, 'src'), { recursive: true })
    await writeFile(join(project, 'package.json'), '{}')

    await expect(prepareOutputDir(project, { clear: true })).rejects.toThrow(/not an unlighthouse output/)
    expect(existsSync(join(project, 'package.json'))).toBe(true)
    expect(existsSync(join(project, 'src'))).toBe(true)
  })

  it('refuses to clear a project whose path only contains a .unlighthouse segment', async () => {
    const project = join(root, '.unlighthouse', 'project')
    await mkdir(join(project, 'src'), { recursive: true })
    await writeFile(join(project, 'package.json'), '{}')

    await expect(prepareOutputDir(project, { clear: true })).rejects.toThrow(/not an unlighthouse output/)
    expect(existsSync(join(project, 'package.json'))).toBe(true)
    expect(existsSync(join(project, 'src'))).toBe(true)
  })

  it('clears a folder it created before', async () => {
    const out = join(root, 'out')
    await prepareOutputDir(out, { clear: true })
    await mkdir(join(out, 'reports'))
    await writeFile(join(out, 'ci-result.json'), '[]')

    await prepareOutputDir(out, { clear: true })
    expect(await readdir(out)).toEqual(['.unlighthouse-output'])
  })

  it('claims a missing or empty folder', async () => {
    const empty = join(root, 'empty')
    await mkdir(empty)
    await prepareOutputDir(empty, { clear: true })
    await writeFile(join(empty, 'ci-result.json'), '[]')
    await prepareOutputDir(empty, { clear: true })
    expect(await readdir(empty)).toEqual(['.unlighthouse-output'])
  })

  it('clears an unmarked folder inside the default .unlighthouse folder of the root', async () => {
    const legacy = join(root, '.unlighthouse', 'localhost', 'abcd')
    await mkdir(join(legacy, 'reports'), { recursive: true })

    await prepareOutputDir(legacy, { clear: true, root })
    expect(await readdir(legacy)).toEqual(['.unlighthouse-output'])
  })

  it('refuses to clear the unmarked default .unlighthouse folder itself', async () => {
    const defaultOut = join(root, '.unlighthouse')
    await mkdir(defaultOut)
    await writeFile(join(defaultOut, 'reports.json'), '[]')

    await expect(prepareOutputDir(defaultOut, { clear: true, root })).rejects.toThrow(/not an unlighthouse output/)
    expect(existsSync(join(defaultOut, 'reports.json'))).toBe(true)
  })

  it('keeps existing files when not clearing', async () => {
    const project = join(root, 'project')
    await mkdir(project)
    await writeFile(join(project, 'package.json'), '{}')

    await prepareOutputDir(project, { clear: false })
    expect(await readdir(project)).toEqual(['package.json'])
  })
})
