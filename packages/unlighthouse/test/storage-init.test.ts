import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { initStorage } from '../src/cli/storage-init'

it('preserves stored data when reopening the initialized local database', async () => {
  const outputPath = await mkdtemp(join(tmpdir(), 'unlighthouse-storage-'))
  try {
    const first = await initStorage({ outputPath, env: { UNLIGHTHOUSE_BLOBS_DRIVER: 'memory' } })
    await first.storage.sites.create({ id: 'site', name: 'Test', url: 'http://localhost', group: null, createdAt: new Date().toISOString() })
    if (!('close' in first.sqliteDb))
      throw new Error('Expected local SQLite')
    first.sqliteDb.close()
    const second = await initStorage({ outputPath, env: { UNLIGHTHOUSE_BLOBS_DRIVER: 'memory' } })
    try {
      expect(await second.storage.sites.get('site')).toMatchObject({ name: 'Test', url: 'http://localhost' })
    }
    finally {
      if ('close' in second.sqliteDb)
        second.sqliteDb.close()
    }
  }
  finally {
    await rm(outputPath, { recursive: true, force: true })
  }
})
