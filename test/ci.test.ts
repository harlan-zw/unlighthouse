import { resolve, join } from 'path'
import fs from 'fs-extra'
import { expect, it, beforeAll, describe, afterAll } from 'vitest'
import { execa } from 'execa'

export const cacheDir = resolve(__dirname, '.cache')
export const ci = resolve(__dirname, '../packages/unlighthouse/bin/unlighthouse-ci.cjs')

beforeAll(async() => {
  await fs.remove(cacheDir)
})

afterAll(async() => {
  await fs.remove(cacheDir)
})

describe('ci', () => {
  it('tests harlanzw.com', async() => {
    const { output } = await runCli(resolve(__dirname, 'fixtures/harlanzw.config.ts'))

    expect(output).toMatchSnapshot()
  })
})

async function runCli(configFileFixture: string) {
  const testDir = resolve(cacheDir, Date.now().toString())

  await fs.ensureDir(testDir)

  const config = await fs.readFile(configFileFixture, 'utf8')
  await fs.writeFile(join(testDir, 'unlighthouse.config.ts'), config)

  const { exitCode, stdout, stderr } = await execa('node', [ci, '--root', testDir, '--debug', '--host', 'harlanzw.com'], {
    cwd: testDir,
  })

  const logs = stdout + stderr
  console.log(logs)
  if (exitCode !== 0)
    throw new Error(logs)

  const output = await fs.readJson(resolve(testDir, '.lighthouse', 'ci-result.json'))

  return {
    output,
    logs,
  }
}
