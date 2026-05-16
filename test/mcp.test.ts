// MCP projection + handler routing — in-memory client/server transport pair.
//
// What we're guarding against:
//   1. A command's `mcp.hidden` getting stripped (the noisy/dangerous tool
//      starts being advertised to agents again — see PR #315).
//   2. The pack handler regressing on the cache hit/miss/refresh cycle that
//      PR #314 shipped.
//   3. The pack tool descriptions losing the agent-friendly explanation —
//      LLMs derive call sequencing from these strings, so silent edits
//      break behaviour even when types still match.
//
// We don't spawn a child process / stdio binary here; that path is exercised
// by the bin shim itself. The in-memory transport lets us assert the
// projection layer in isolation in well under a second.

import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { commands } from '@unlighthouse/contracts'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { manualSeeds } from '@unlighthouse/core/seeds/manual'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { createMcpServer } from '@unlighthouse/mcp'
import { beforeAll, describe, expect, it } from 'vitest'

let client: Client
let scanId: string

beforeAll(async () => {
  // Real core/storage stack, mocked auditor — gives us a writable scan and
  // a working pack pipeline without hitting Chrome or the network.
  const storage = memoryStorage()
  const auditor = createMockAuditor()
  const core = createUnlighthouseCore({
    config: { site: 'http://localhost' } as never,
    auditor,
    seeds: manualSeeds({ urls: ['http://localhost/'] }),
    crawler: parallelMapCrawler({ concurrency: 1 }),
    storage,
  })
  const ctx: HandlerCtx = {
    core,
    auditor,
    storage,
    config: { site: 'http://localhost' } as never,
    version: 'test',
  }

  // Seed one finished scan so pack.run has data to reconcile against.
  const handlers = createHandlers()
  const startResult = await (handlers['scan.start'] as { run: (i: unknown, c: HandlerCtx) => Promise<{ scanId: string }> }).run(
    { site: 'http://localhost' },
    ctx,
  )
  scanId = startResult.scanId
  // Wait for the scan to drain — parallel-map crawler with concurrency 1 and
  // one seed completes synchronously inside core.run; poll just in case.
  await new Promise(r => setTimeout(r, 50))

  // Wire the MCP server and connect an in-memory client to it.
  const server = createMcpServer({ handlers, ctx, identity: { name: 'test', version: 'test' } })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test-client', version: 'test' }, { capabilities: {} })
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])
})

describe('MCP tool surface', () => {
  it('does not advertise destructive / orchestration commands', async () => {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))

    // Curated hidden-set (PR #315). Listed by MCP tool name (dots → underscores).
    const mustBeHidden = [
      'scan_cancel',
      'scan_pause',
      'scan_resume',
      'scan_delete',
      'scan_current',
      'scan_rescanAll',
      'route_rescan',
      'history_delete',
      'history_rescan',
      'sites_create',
      'sites_delete',
      'auditors_test',
      'events_subscribe',
      'events_tail',
    ]
    for (const hidden of mustBeHidden)
      expect(names.has(hidden), `${hidden} should be hidden from MCP`).toBe(false)
  })

  it('advertises the pack tools', async () => {
    const { tools } = await client.listTools()
    const names = new Set(tools.map(t => t.name))
    expect(names.has('pack_run')).toBe(true)
    expect(names.has('pack_list')).toBe(true)
    expect(names.has('scan_summary')).toBe(true)
  })

  it('pack tool descriptions spell out the agent calling sequence', async () => {
    // These descriptions are LLM-facing. If someone shortens them back to the
    // pre-PR one-liners ("Execute a registered pack against a scan"), agents
    // lose the workflow hint. Guard with substring assertions on the bits
    // that carry the workflow signal.
    const { tools } = await client.listTools()
    const packRun = tools.find(t => t.name === 'pack_run')
    expect(packRun?.description).toMatch(/pack\.list/i)
    expect(packRun?.description).toMatch(/history\.list/i)
    const packList = tools.find(t => t.name === 'pack_list')
    expect(packList?.description).toMatch(/overview/i)
    expect(packList?.description).toMatch(/images/i)
  })

  it('tool count equals (visible registry commands)', async () => {
    // Sanity check the projection isn't accidentally listing hidden commands.
    const visible = Object.values(commands).filter(c => !c.mcp?.hidden).length
    const { tools } = await client.listTools()
    expect(tools.length).toBe(visible)
  })
})

describe('MCP scan.start end-to-end (v1.md line 1710 ship gate)', () => {
  it('drives scan_start → scan_status → scan_summary → pack_run via MCP', async () => {
    // The "ship gate" in v1.md: an agent connects, calls scan_start with a
    // URL it picked itself, polls scan_status until done, and reads results
    // back through scan_summary + pack_run — without the host pre-configuring
    // a site. This test runs the whole loop over the in-memory transport.
    //
    // The fixture core is wired to a fresh memoryStorage instance (separate
    // from the beforeAll's per-suite storage); it crawls one seed URL via
    // the mock auditor and finishes synchronously.
    const storage = memoryStorage()
    const auditor = createMockAuditor()
    const core = createUnlighthouseCore({
      config: { site: 'http://agent-site' } as never,
      auditor,
      seeds: manualSeeds({ urls: ['http://agent-site/'] }),
      crawler: parallelMapCrawler({ concurrency: 1 }),
      storage,
    })
    const ctx: HandlerCtx = {
      core,
      auditor,
      storage,
      config: { site: 'http://agent-site' } as never,
      version: 'test',
    }
    const handlers = createHandlers()
    const server = createMcpServer({ handlers, ctx, identity: { name: 'gate', version: 'test' } })
    const [c, s] = InMemoryTransport.createLinkedPair()
    const gateClient = new Client({ name: 'gate-client', version: 'test' }, { capabilities: {} })
    await Promise.all([server.connect(s), gateClient.connect(c)])

    // 1. Agent triggers a scan with a URL it picked. No host preset required.
    const startCall = await gateClient.callTool({
      name: 'scan_start',
      arguments: { site: 'http://agent-site' },
    })
    const started = JSON.parse((startCall.content as Array<{ text: string }>)[0].text)
    expect(started.scanId).toMatch(/^[0-9a-f-]{36}$/)
    expect(started.site).toBe('http://agent-site')

    // 2. Agent polls scan_status until terminal. parallel-map + 1 seed +
    //    mock auditor drains in < 100ms, but we loop defensively.
    const startedScanId: string = started.scanId
    let statusJson: { status: string } | null = null
    for (let attempt = 0; attempt < 50; attempt++) {
      const res = await gateClient.callTool({
        name: 'scan_status',
        arguments: { scanId: startedScanId },
      })
      statusJson = JSON.parse((res.content as Array<{ text: string }>)[0].text)
      if (statusJson?.status === 'complete' || statusJson?.status === 'error' || statusJson?.status === 'cancelled')
        break
      await new Promise(r => setTimeout(r, 25))
    }
    expect(statusJson?.status).toBe('complete')

    // 3. Agent reads the layered output: summary first, then drill via pack.
    const summaryRes = await gateClient.callTool({
      name: 'scan_summary',
      arguments: { scanId: startedScanId },
    })
    const summary = JSON.parse((summaryRes.content as Array<{ text: string }>)[0].text)
    expect(summary.scanId).toBe(startedScanId)
    expect(summary.routesScanned).toBeGreaterThan(0)

    const packRes = await gateClient.callTool({
      name: 'pack_run',
      arguments: { scanId: startedScanId, pack: 'overview' },
    })
    const pack = JSON.parse((packRes.content as Array<{ text: string }>)[0].text)
    expect(pack.cache).toBe('miss')
    expect(pack.report.routesScanned).toBeGreaterThan(0)

    // 4. ciBuild was auto-detected from git — the scan row should carry the
    // current commit even though the agent passed no ciBuild block. (The
    // checkout this test runs in is always a git repo with a HEAD commit.)
    const historyRes = await gateClient.callTool({
      name: 'history_get',
      arguments: { scanId: startedScanId },
    })
    const history = JSON.parse((historyRes.content as Array<{ text: string }>)[0].text)
    expect(history.ciCommit).toMatch(/^[0-9a-f]{40}$/)
  }, 15_000)
})

describe('MCP pack.run caching', () => {
  it('reports cache miss → hit → refresh-miss', async () => {
    // First call — fresh reconcile.
    const r1 = await client.callTool({
      name: 'pack_run',
      arguments: { scanId, pack: 'overview' },
    })
    const p1 = JSON.parse((r1.content as Array<{ text: string }>)[0].text)
    expect(p1.cache).toBe('miss')

    // Second call — served from cache, same startedAt as the first.
    const r2 = await client.callTool({
      name: 'pack_run',
      arguments: { scanId, pack: 'overview' },
    })
    const p2 = JSON.parse((r2.content as Array<{ text: string }>)[0].text)
    expect(p2.cache).toBe('hit')
    expect(p2.startedAt).toBe(p1.startedAt)

    // Force refresh — new reconcile, new startedAt. A 2ms wait pushes the
    // second startedAt past the ms-rounded ISO timestamp from the first call;
    // without it the overview pack reconciles fast enough that both runs can
    // land in the same millisecond on a hot CI runner.
    await new Promise(resolve => setTimeout(resolve, 2))
    const r3 = await client.callTool({
      name: 'pack_run',
      arguments: { scanId, pack: 'overview', refresh: true },
    })
    const p3 = JSON.parse((r3.content as Array<{ text: string }>)[0].text)
    expect(p3.cache).toBe('miss')
    expect(p3.startedAt).not.toBe(p1.startedAt)
  })
})
