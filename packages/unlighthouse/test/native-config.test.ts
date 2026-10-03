import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createJiti } from '../src/config/native-import'

it('loads native TypeScript configuration with the config helper', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'unlighthouse-config-'))
  const path = join(directory, 'unlighthouse.config.ts')
  try {
    await writeFile(path, 'import { defineUnlighthouseConfig } from "unlighthouse/config"; interface Site { site: string }; const value: Site = {site: "https://example.com"}; export default defineUnlighthouseConfig(value)')
    expect(await createJiti(path).import(path, { default: true })).toEqual({ site: 'https://example.com' })
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('surfaces configuration errors without downloading a compiler or running code again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'unlighthouse-config-'))
  const path = join(directory, 'unlighthouse.config.ts')
  try {
    await writeFile(path, 'throw new Error("Invalid site configuration"); export default {}')
    await expect(createJiti(path).import(path, { default: true })).rejects.toThrow('Invalid site configuration')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
