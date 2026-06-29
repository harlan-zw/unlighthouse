import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

export const cacheDir = resolve(__dirname, '.cache')
export const ci = resolve(__dirname, '../packages/unlighthouse/bin/unlighthouse-ci.mjs')

beforeAll(async () => {
  await rm(cacheDir, { recursive: true, force: true })
})

afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true })
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

  await mkdir(testDir, { recursive: true })

  const config = await readFile(configFileFixture, 'utf8')
  await writeFile(join(testDir, 'unlighthouse.config.ts'), config)

  const { exitCode, stdout, stderr } = await runNode([ci, '--root', testDir, '--debug', '--site', 'harlanzw.com'], testDir)

  const logs = stdout + stderr
  if (exitCode !== 0)
    throw new Error(logs)

  const output = JSON.parse(await readFile(resolve(testDir, '.unlighthouse', 'ci-result.json'), 'utf8'))

  return {
    output,
    logs,
  }
}

async function runNode(args: string[], cwd: string): Promise<{ exitCode: number, stdout: string, stderr: string }> {
  const child = spawn('node', args, {
    cwd,
    env: { ...process.env, JITI_ESM_RESOLVE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => stdout += chunk)
  child.stderr.on('data', chunk => stderr += chunk)
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => resolve(code ?? 1))
  })
  return { exitCode, stdout, stderr }
}
