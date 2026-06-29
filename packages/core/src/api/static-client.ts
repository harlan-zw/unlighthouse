// Static (offline) client. Serves the dashboard's read commands from an
// embedded snapshot instead of an HTTP API — the data layer behind
// `--build-static`. It reuses the real, transport-agnostic command handlers
// over an in-memory storage seeded from the snapshot, so responses are
// byte-identical to the live API (it's the same handler code).
//
// Only read commands are meaningful offline. Write/streaming commands
// (scan.start, route.rescan, events.*, …) reject — a static report is a
// frozen artefact; the UI gates those controls on `__unlighthouse_static`.
//
// ── Remaining integration for `--build-static` (maintainer-owned) ────────────
// The data layer below is done + tested (test/static-client.test.ts). What's
// left is wiring it into the build + UI, which touches core's browser
// portability — an architecture call:
//   1. build.ts (static:true): call `buildStaticSnapshot()` and embed the
//      result as `window.__unlighthouse_payload.snapshot`; export screenshot +
//      LHR blobs to assets/ files and rewrite their URLs with routerPrefix
//      (this also resolves #275's static-context broken thumbnails).
//   2. ci.ts: consume `--build-static` → `generateClient({ static: true })`.
//   3. UI api.client.ts: when `window.__unlighthouse_static`, provide
//      `createStaticClient(payload.snapshot)` instead of the HTTP client
//      (single dynamic-import guard; live path untouched). Add a useIsStatic()
//      composable to hide write buttons / live polling.
//   BROWSER-COMPAT BLOCKER: importing createStaticClient into the Nuxt
//   (ssr:false) bundle pulls in createHandlers → route.ts/scan.ts/pack.ts and
//   memory storage, which carry module-level node:crypto / node:zlib /
//   node:buffer imports. These must be made browser-safe first (Buffer→
//   TextDecoder; node:zlib→fflate or rely on pre-run pack cache so the inflate
//   path is never hit; node:crypto sha1→a JS impl or seed rows so urlHash is
//   never called). That refactor is the core-portability decision this client
//   intentionally stops short of.
import type {
  Scan,
  ScanRoute,
} from '@unlighthouse/contracts/types/atoms'
import type { CommandName } from '@unlighthouse/contracts/commands'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { PackRun } from '@unlighthouse/contracts/packs'
import type { SiteRecord, Storage } from '@unlighthouse/contracts/ports'
import type { UnlighthouseClient } from './client'
import { commands } from '@unlighthouse/contracts/commands'
import { memoryStorage } from '../storage/memory'
import { createHandlers } from './handlers'

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

/** Packs the dashboard renders — pre-run at build time so offline pack.run hits the cache. */
export const STATIC_SNAPSHOT_PACKS = [
  'cwv',
  'insights',
  'images',
  'seo-basics',
  'a11y-quick-wins',
  'js-bundle',
  'agentic-browsing',
  'crux',
  'overview',
] as const

/**
 * Collect everything the static client needs to serve one scan offline, by
 * reading the same storage the live API reads. Pure data-collection (plus an
 * optional pre-run of the dashboard packs so their pages render offline) — no
 * fs, no client copy; build.ts embeds the result into the payload.
 */
export async function buildStaticSnapshot(opts: {
  storage: Storage
  scanId: string
  config: UnlighthouseConfig
  version?: string
  /** Pre-run these packs into the cache before collecting (default: the dashboard set). Pass [] to only collect already-cached runs. */
  packs?: readonly string[]
}): Promise<StaticSnapshot> {
  const { storage, scanId, config } = opts
  const scan = await storage.scans.get(scanId as never)
  const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })

  // Pre-run the dashboard packs so pack.run hits the cache offline. Runs in
  // Node at build time where zlib/crypto are available; failures are non-fatal
  // (that pack page just shows empty offline).
  const packs = opts.packs ?? STATIC_SNAPSHOT_PACKS
  if (packs.length) {
    const handlers = createHandlers()
    const ctx = { core: { session: () => null } as never, auditor: undefined as never, storage, config, version: opts.version ?? 'static' }
    for (const pack of packs) {
      try {
        await (handlers['pack.run'] as { run: (i: unknown, c: unknown) => Promise<unknown> }).run({ scanId, pack }, ctx)
      }
      catch {
        // pack unavailable / no data for this scan — skip
      }
    }
  }

  const packRuns = await storage.packRuns.listForScan(scanId as never)

  // Contract blobs the read handlers reconcile route/summary/categories from,
  // plus any blob a pack-run cache row spilled to (large reports).
  const blobKeys = new Set<string>()
  for (const r of routes) {
    if (r.reportBlobKey)
      blobKeys.add(r.reportBlobKey.replace('.json', '.contract.json'))
  }
  for (const run of packRuns) {
    const key = (run as { blobKey?: string }).blobKey
    if (key)
      blobKeys.add(key)
  }
  const blobs: Record<string, string> = {}
  for (const key of blobKeys) {
    const buf = await storage.blobs.get(key)
    if (buf)
      blobs[key] = new TextDecoder().decode(buf)
  }

  const sites = await storage.sites.list()

  return {
    scans: scan ? [scan] : [],
    routes,
    blobs,
    packRuns,
    sites,
    config,
    version: opts.version,
  }
}

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
