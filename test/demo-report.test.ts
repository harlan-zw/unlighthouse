import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { findDemoReport } from '../scripts/demo-report'

const directories: string[] = []

async function outputRoot() {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-demo-'))
  directories.push(root)
  return root
}

async function report(root: string, relative: string) {
  const directory = join(root, relative)
  await mkdir(join(directory, 'assets'), { recursive: true })
  await writeFile(join(directory, 'assets/payload.js'), 'window.__unlighthouse_payload = {}')
  await writeFile(join(directory, 'index.html'), '<html></html>')
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('publishes the generated dashboard instead of its parent directory', async () => {
  const root = await outputRoot()
  const directory = await report(root, 'unlighthouse.dev/55e5')
  expect(await findDemoReport(root)).toEqual({ _tag: 'Ok', directory })
})

it('rejects output without a static dashboard', async () => {
  const root = await outputRoot()
  expect(await findDemoReport(root)).toEqual({ _tag: 'Err', reason: 'missing-report' })
})

it('rejects ambiguous output instead of deploying an arbitrary scan', async () => {
  const root = await outputRoot()
  await report(root, 'unlighthouse.dev/first')
  await report(root, 'unlighthouse.dev/second')
  expect(await findDemoReport(root)).toEqual({ _tag: 'Err', reason: 'multiple-reports' })
})
