import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { x } from 'tinyexec'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// type checks a consumer of the built `unlighthouse` package the way a user's project would, without skipLibCheck
const require = createRequire(import.meta.url)
// no workspace package depends on @types/node, it is installed as a peer of vite
const viteRequire = createRequire(require.resolve('vite'))
let consumerDir: string

beforeAll(async () => {
  consumerDir = await mkdtemp(join(tmpdir(), 'unlighthouse-consumer-'))
  await mkdir(join(consumerDir, 'node_modules', '@types'), { recursive: true })
  await symlink(resolve(__dirname, '../packages/unlighthouse'), join(consumerDir, 'node_modules', 'unlighthouse'))
  await symlink(await realpath(dirname(viteRequire.resolve('@types/node/package.json'))), join(consumerDir, 'node_modules', '@types', 'node'))
  await writeFile(join(consumerDir, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module', private: true }))
  await writeFile(join(consumerDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: ['node'] },
    include: ['*.ts'],
  }))
  await writeFile(join(consumerDir, 'unlighthouse.config.ts'), `
import type { UnlighthouseRouteReport } from 'unlighthouse'
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  hooks: {
    'task-complete': (path: string, report: UnlighthouseRouteReport) => {
      const performance = report.report?.categories.find(category => category.key === 'performance')
      console.log(path, performance?.score)
    },
  },
})
`)
})

afterAll(async () => {
  await rm(consumerDir, { recursive: true, force: true })
})

describe('published types', () => {
  it('type check a config file without skipLibCheck', async () => {
    const { stdout, exitCode } = await x(require.resolve('typescript/bin/tsc'), ['-p', consumerDir])
    expect(stdout).toBe('')
    expect(exitCode).toBe(0)
  })
})
