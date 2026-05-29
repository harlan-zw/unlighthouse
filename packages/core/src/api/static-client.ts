// Static (offline) client. Serves the dashboard's read commands from an
// embedded snapshot instead of an HTTP API — the data layer behind
// `--build-static`. It reuses the real, transport-agnostic command handlers
// over an in-memory storage seeded from the snapshot, so responses are
// byte-identical to the live API (it's the same handler code).
//
// Only read commands are meaningful offline. Write/streaming commands
// (scan.start, route.rescan, events.*, …) reject — a static report is a
// frozen artefact; the UI gates those controls on `__unlighthouse_static`.
import type {
  CommandName,
  PackRun,
  Scan,
  ScanRoute,
  SiteRecord,
  Storage,
  UnlighthouseConfig,
} from '@unlighthouse/contracts'
import { commands } from '@unlighthouse/contracts'
import { memoryStorage } from '../storage/memory'
import { createHandlers } from './handlers'
import type { UnlighthouseClient } from './client'

/**
 * Self-contained snapshot of one or more scans, embedded into the static
 * build's payload. Everything the read handlers need to answer the dashboard's
 * queries without a server.
 */
export interface StaticSnapshot {
  /** Scan rows — drives history.list, scan.meta, scan.summary. */
  scans: Scan[]
  /** Every audited route row (carries reportBlobKey / device). */
  routes: ScanRoute[]
  /** blobKey → UTF-8 JSON string. Contract blobs the read handlers reconcile. */
  blobs: Record<string, string>
  /** Pre-run pack outputs, seeded as cache rows so pack.run returns a hit. */
  packRuns: PackRun[]
  /** Registered sites — drives sites.list and the home page. */
  sites: SiteRecord[]
  /** Resolved config subset (site, scanner, routerPrefix, …). */
  config: UnlighthouseConfig
  /** Package version surfaced by health/manifest. */
  version?: string
}

const WRITE_REJECT_MESSAGE = 'This is a static report — live actions are unavailable offline.'

const WRITE_COMMANDS = new Set<CommandName>([
  'scan.start',
  'scan.cancel',
  'scan.pause',
  'scan.resume',
  'scan.delete',
  'scan.import',
  'scan.rescanAll',
  'route.rescan',
  'history.rescan',
  'sites.create',
  'sites.delete',
])

function seedStorage(snapshot: StaticSnapshot): Storage {
  const storage = memoryStorage()

  // Blobs first — handlers reconcile route/summary from the contract blob.
  for (const [key, json] of Object.entries(snapshot.blobs))
    void storage.blobs.put(key, new TextEncoder().encode(json))

  for (const scan of snapshot.scans)
    void storage.scans.create(scan as never)

  // Group rows by (scanId, device) for putBatch; reportBlobKey/screenshotBlobKey
  // ride through unchanged (toRoute only recomputes lhrBlobKey).
  const byScanDevice = new Map<string, ScanRoute[]>()
  for (const r of snapshot.routes) {
    const k = `${r.scanId}::${r.device}`
    const list = byScanDevice.get(k) ?? []
    list.push(r)
    byScanDevice.set(k, list)
  }
  for (const [k, rows] of byScanDevice) {
    const [scanId, device] = k.split('::')
    void storage.routes.putBatch(scanId as never, device as never, rows as never)
  }

  for (const run of snapshot.packRuns)
    void storage.packRuns.put(run)

  for (const site of snapshot.sites)
    void storage.sites.create(site)

  return storage
}

/**
 * Build an `UnlighthouseClient` that answers from `snapshot` instead of HTTP.
 * Drop-in for the live client — same method shape — so the UI's `useApi()`
 * doesn't change.
 */
export function createStaticClient(snapshot: StaticSnapshot): UnlighthouseClient {
  const storage = seedStorage(snapshot)
  const handlers = createHandlers()
  const ctx = {
    // No live session offline; scanMeta/scanCurrent tolerate a null session.
    core: { session: () => null } as never,
    auditor: undefined as never,
    storage,
    config: snapshot.config,
    version: snapshot.version ?? 'static',
  }

  const client = {} as Record<string, unknown>
  for (const name of Object.keys(commands) as CommandName[]) {
    const cmd = commands[name] as { streaming?: boolean, input?: { safeParse: (v: unknown) => { success: boolean, data?: unknown } } }
    const handler = handlers[name]

    if (cmd.streaming) {
      // Streaming reads (events.*) are live-only; offline yields nothing.
      client[name] = () => (async function* () {})()
      continue
    }

    client[name] = async (input: unknown) => {
      if (WRITE_COMMANDS.has(name))
        throw new Error(WRITE_REJECT_MESSAGE)
      if (!handler || typeof handler.run !== 'function')
        throw new Error(`${name}: not available in a static report`)
      const parsed = cmd.input?.safeParse(input)
      const value = parsed?.success ? parsed.data : (input ?? {})
      return handler.run(value as never, ctx as never) as never
    }
  }
  return client as UnlighthouseClient
}
