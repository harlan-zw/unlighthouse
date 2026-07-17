// Static (offline) client. Serves the dashboard's read commands from an
// embedded snapshot instead of an HTTP API — the data layer behind
// `--build-static`. It reuses the real, transport-agnostic command handlers
// over an in-memory storage seeded from the snapshot, so responses are
// byte-identical to the live API (it's the same handler code).
//
// Only read commands are meaningful offline. Write/streaming commands
// (scan.start, route.rescan, events.*, …) reject — a static report is a
// frozen artefact; the UI hides those controls via `useIsStatic()`.
//
// D-032 landed the browser-portability this file used to stop short of: the
// read slice reachable from here (report/*, memory storage, handlers) carries
// no node:zlib / node:crypto / node:buffer, so this module bundles cleanly into
// the Nuxt (ssr:false) build. Enforced by test/treeshake.test.ts's
// `browser-static` scenario. The build wiring is live: `build.ts` embeds
// `buildStaticSnapshot()` as `window.__unlighthouse_payload.snapshot`, `ci.ts`
// consumes `--build-static`, and `api.client.ts` swaps in `createStaticClient`
// when `window.__unlighthouse_static`.
import type { Auditor, Logger, UnlighthouseCore } from '@unlighthouse/contracts'
import type { UnlighthouseClient } from '@unlighthouse/contracts/client'
import type { CommandInput, CommandName, CommandOutput, CommandRegistry } from '@unlighthouse/contracts/commands'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { PackRun } from '@unlighthouse/contracts/packs'
import type { SiteRecord, Storage } from '@unlighthouse/contracts/ports'
import type {
  Scan,
  ScanRoute,
} from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx, HandlerMap } from './handlers'
import { commands } from '@unlighthouse/contracts/commands'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { parseScanId } from '@unlighthouse/contracts/types/atoms'
import { routeContractBlobKey } from '../report/route-contracts'
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
  'best-practices',
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
  logger?: Logger
  /** Pre-run these packs into the cache before collecting (default: the dashboard set). Pass [] to only collect already-cached runs. */
  packs?: readonly string[]
}): Promise<StaticSnapshot> {
  const { storage, config } = opts
  const scanId = parseScanId(opts.scanId)
  const scan = await storage.scans.get(scanId)
  const { items: routes } = await storage.routes.listForScan(scanId, { pageSize: 10_000 })

  // Pre-run the dashboard packs so pack.run hits the cache offline. Runs in
  // Node at build time where zlib/crypto are available; failures are non-fatal
  // (that pack page just shows empty offline).
  const packs = opts.packs ?? STATIC_SNAPSHOT_PACKS
  if (packs.length) {
    const handlers = createHandlers()
    const ctx = createStaticHandlerCtx(storage, config, opts.version)
    for (const pack of packs) {
      try {
        await (handlers['pack.run'] as { run: (i: unknown, c: unknown) => Promise<unknown> }).run({ scanId, pack }, ctx)
      }
      catch (err) {
        logOperationalWarn('host.static_snapshot_pack_failed', err, { scanId, pack }, opts.logger)
      }
    }
  }

  const packRuns = await storage.packRuns.listForScan(scanId)

  // Contract blobs the read handlers reconcile route/summary/categories from,
  // plus any blob a pack-run cache row spilled to (large reports).
  const blobKeys = new Set<string>()
  for (const r of routes) {
    const key = routeContractBlobKey(r)
    if (key)
      blobKeys.add(key)
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
    void storage.scans.create(scan)

  // Group rows by (scanId, device) for putBatch; all artifact keys ride through
  // unchanged so an offline snapshot points at the blobs it actually contains.
  const byScanDevice = new Map<string, ScanRoute[]>()
  for (const r of snapshot.routes) {
    const k = `${r.scanId}::${r.device}`
    const list = byScanDevice.get(k) ?? []
    list.push(r)
    byScanDevice.set(k, list)
  }
  for (const [k, rows] of byScanDevice) {
    const [scanId, device] = k.split('::')
    if ((device === 'mobile' || device === 'desktop') && scanId)
      void storage.routes.putBatch(parseScanId(scanId), device, rows)
  }

  for (const run of snapshot.packRuns)
    void storage.packRuns.put(run)

  for (const site of snapshot.sites)
    void storage.sites.create(site)

  return storage
}

const staticCore: UnlighthouseCore = {
  run: () => {
    throw new Error(WRITE_REJECT_MESSAGE)
  },
  session: () => null,
  hooks: undefined,
}

const staticAuditor: Auditor = {
  capabilities: {
    reliablePerfScores: false,
    reliableFieldData: false,
    supportsThrottling: false,
    categories: ['performance', 'accessibility', 'seo', 'best-practices', 'agentic-browsing'],
  },
  audit: async () => {
    throw new Error(WRITE_REJECT_MESSAGE)
  },
}

function createStaticHandlerCtx(storage: Storage, config: UnlighthouseConfig, version?: string): HandlerCtx {
  return {
    core: staticCore,
    auditor: staticAuditor,
    storage,
    config,
    version: version ?? 'static',
  }
}

function runStaticHandler<K extends CommandName>(
  handlers: HandlerMap,
  name: K,
  input: unknown,
  ctx: HandlerCtx,
): Promise<CommandOutput<CommandRegistry[K]>> | AsyncIterable<CommandOutput<CommandRegistry[K]>> {
  return handlers[name].run(input as CommandInput<CommandRegistry[K]>, ctx)
}

/**
 * Build an `UnlighthouseClient` that answers from `snapshot` instead of HTTP.
 * Drop-in for the live client — same method shape — so the UI's `useApi()`
 * doesn't change.
 */
export function createStaticClient(snapshot: StaticSnapshot): UnlighthouseClient {
  const storage = seedStorage(snapshot)
  const handlers = createHandlers()
  const ctx = createStaticHandlerCtx(storage, snapshot.config, snapshot.version)

  const client = {} as Record<string, unknown>
  for (const name of Object.keys(commands) as CommandName[]) {
    const cmd = commands[name]
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
      const output = await runStaticHandler(handlers, name, value, ctx)
      return cmd.output.parse(output)
    }
  }
  return client as UnlighthouseClient
}
