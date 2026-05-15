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

    // Force refresh — new reconcile, new startedAt.
    const r3 = await client.callTool({
      name: 'pack_run',
      arguments: { scanId, pack: 'overview', refresh: true },
    })
    const p3 = JSON.parse((r3.content as Array<{ text: string }>)[0].text)
    expect(p3.cache).toBe('miss')
    expect(p3.startedAt).not.toBe(p1.startedAt)
  })
})
