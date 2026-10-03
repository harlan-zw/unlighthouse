import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { expect, it } from 'vitest'
import { createLibsqlDriver } from '../src/cli/libsql'

const items = sqliteTable('items', { id: integer().primaryKey(), name: text().notNull() })
const labels = sqliteTable('labels', { id: integer().primaryKey(), itemId: integer(), name: text() })

it('preserves duplicate column names and rolls back a failed remote batch', async () => {
  const client = createClient({ url: 'file::memory:' })
  const driver = createLibsqlDriver(client)
  try {
    await client.executeMultiple('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE labels (id INTEGER PRIMARY KEY, itemId INTEGER, name TEXT)')
    expect(await driver.insert(items).values({ id: 1, name: 'Item' }).returning()).toEqual([{ id: 1, name: 'Item' }])
    await driver.insert(labels).values({ id: 2, itemId: 1, name: 'Label' })
    expect(await driver.select({ itemId: items.id, labelId: labels.id, item: items.name, label: labels.name }).from(items).innerJoin(labels, eq(items.id, labels.itemId))).toEqual([{ itemId: 1, labelId: 2, item: 'Item', label: 'Label' }])
    expect(await driver.select().from(items).where(eq(items.id, 99)).get()).toBeUndefined()
    await expect(driver.batch([driver.insert(items).values({ id: 2, name: 'Rollback' }), driver.insert(items).values({ id: 1, name: 'Duplicate' })])).rejects.toThrow()
    expect(await driver.select().from(items)).toEqual([{ id: 1, name: 'Item' }])
  }
  finally {
    client.close()
  }
})
