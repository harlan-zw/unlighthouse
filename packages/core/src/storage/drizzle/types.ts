export interface DrizzleQuery<T> extends PromiseLike<T> {
  from: (source: unknown) => DrizzleQuery<T>
  where: (condition: unknown) => DrizzleQuery<T>
  orderBy: (...clauses: unknown[]) => DrizzleQuery<T>
  limit: (count: number) => DrizzleQuery<T>
  offset: (count: number) => DrizzleQuery<T>
  values: (value: unknown) => DrizzleQuery<T>
  returning: (fields?: unknown) => DrizzleQuery<T>
  set: (value: Record<string, unknown>) => DrizzleQuery<T>
  onConflictDoUpdate: (config: unknown) => DrizzleQuery<T>
}

export interface DrizzleDatabase {
  select: <T = unknown>(fields?: unknown) => DrizzleQuery<T[]>
  insert: <T = unknown>(table: unknown) => DrizzleQuery<T[]>
  update: <T = unknown>(table: unknown) => DrizzleQuery<T[]>
  delete: <T = unknown>(table: unknown) => DrizzleQuery<T[]>
}

export type DrizzleBatchExecutor = (
  statements: readonly [DrizzleQuery<unknown[]>, ...DrizzleQuery<unknown[]>[]],
) => Promise<void>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function asDrizzleDatabase(db: unknown): DrizzleDatabase {
  if (
    !isRecord(db)
    || typeof db.select !== 'function'
    || typeof db.insert !== 'function'
    || typeof db.update !== 'function'
    || typeof db.delete !== 'function'
  ) {
    throw new TypeError('Expected a drizzle-compatible database handle.')
  }
  return db as unknown as DrizzleDatabase
}
