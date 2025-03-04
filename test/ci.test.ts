import { join, resolve } from 'node:path'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execa } from 'execa'

export const cacheDir = resolve(__dirname, '.cache')
export const ci = resolve(__dirname, '../packages/unlighthouse/bin/unlighthouse-ci.mjs')

beforeAll(async () => {
  await fs.remove(cacheDir)
})

afterAll(async () => {
  await fs.remove(cacheDir)
})

describe('ci', () => {
  it('tests harlanzw.com', async () => {
    const { output } = await runCli(resolve(__dirname, 'fixtures/harlanzw.config.ts'))

    expect(output[0].path).toBeDefined()
    expect(output[0].score).toBeDefined()
  })

  it('tests harlanzw.com and generate json expanded', async () => {
    const { output } = await runCli(resolve(__dirname, 'fixtures/harlanzw-json-expanded.config.ts'))

    expect(output.summary).toBeDefined()
    expect(output.summary.score).toBeDefined()
    expect(output.metadata).toBeDefined()
    expect(output.routes[0].path).toBeDefined()
    expect(output.routes[0].score).toBeDefined()
    expect(output.routes[0].categories).toBeDefined()
  })
})

async function runCli(configFileFixture: string) {
  const testDir = resolve(cacheDir, Date.now().toString())

  await fs.ensureDir(testDir)

  const config = await fs.readFile(configFileFixture, 'utf8')
  await fs.writeFile(join(testDir, 'unlighthouse.config.ts'), config)

  const { exitCode, stdout, stderr } = await execa('node', [ci, '--root', testDir, '--debug', '--site', 'harlanzw.com'], {
    cwd: testDir,
  })

  const logs = stdout + stderr
  if (exitCode !== 0)
    throw new Error(logs)

  const output = await fs.readJson(resolve(testDir, '.unlighthouse', 'ci-result.json'))

  return {
    output,
    logs,
  }
}
