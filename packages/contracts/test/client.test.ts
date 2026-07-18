// Unit tests for the typed client. The client is dependency-light; we drive
// it with a mock fetch and assert URL / method / body / streaming behaviour.

import { callClientCommand, createClient } from '@unlighthouse/contracts/client'
import { describe, expect, it, vi } from 'vitest'
import { testScanId, testUrl } from '../../../test/helpers/contracts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ndjsonResponse(lines: unknown[]): Response {
  const text = lines.map(l => JSON.stringify(l)).join('\n')
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

describe('typed client', () => {
  it('pOST scan.start sends JSON body to /api/scan/start', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      scanId: 'abc',
      site: 'https://example.com',
      mode: 'site',
      startedAt: '2025-01-01T00:00:00.000Z',
    }))
    const client = createClient({ fetch: fetchMock })
    const out = await client['scan.start']({ site: testUrl('https://example.com') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/scan/start')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ site: 'https://example.com' })
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(out.scanId).toBe('abc')
  })

  it('gET scan.status encodes query string from input', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      scanId: 'abc',
      status: 'scanning',
      discovered: 0,
      scanned: 0,
      failed: 0,
      total: 0,
      startedAt: '2025-01-01T00:00:00.000Z',
      completedAt: null,
    }))
    const client = createClient({ fetch: fetchMock })
    await client['scan.status']({ scanId: testScanId('abc') })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/scan/status?scanId=abc')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('gET events.subscribe streams NDJSON chunks as AsyncIterable', async () => {
    const events = [
      { event: 'scan:started', payload: { scanId: 'abc' } },
      { event: 'scan:progress', payload: { scanId: 'abc', discovered: 1, scanned: 0, failed: 0, total: 1 } },
      { event: 'log', payload: { level: 'info', message: 'scan queued' } },
    ]
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ndjsonResponse(events))
    const client = createClient({ fetch: fetchMock })
    const iter = client['events.subscribe']({})
    const out: unknown[] = []
    for await (const ev of iter)
      out.push(ev)
    expect(out).toEqual(events)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/events/subscribe')
    expect(init.method).toBe('GET')
    expect(init.headers.Accept).toBe('application/x-ndjson')
  })

  it('error responses throw with err.name === error.code', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(
      {
        error: {
          code: 'SCAN_NOT_FOUND',
          message: 'gone',
          statusCode: 404,
          category: 'fatal',
          suggestion: 'Pick another scan.',
          docsUrl: 'https://unlighthouse.dev/',
          details: { scanId: 'missing' },
        },
      },
      404,
    ))
    const client = createClient({ fetch: fetchMock })
    await expect(client['scan.status']({ scanId: testScanId('missing') })).rejects.toMatchObject({
      name: 'SCAN_NOT_FOUND',
      code: 'SCAN_NOT_FOUND',
      message: 'gone',
      statusCode: 404,
      suggestion: 'Pick another scan.',
      docsUrl: 'https://unlighthouse.dev/',
      details: { scanId: 'missing' },
    })
  })

  it('honours a custom baseUrl', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ scanId: null }))
    const client = createClient({ baseUrl: 'https://host/api', fetch: fetchMock })
    await client['scan.current']({})
    expect(fetchMock.mock.calls[0][0]).toBe('https://host/api/scan/current')
  })

  it('preserves command correlation through generic non-streaming callers', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ scanId: null }))
    const client = createClient({ fetch: fetchMock })
    const output = await callClientCommand(client, 'scan.current', {})
    expect(output).toEqual({ scanId: null })
  })
})
