// Unit tests for the typed client. The client is dependency-light; we drive
// it with a mock fetch and assert URL / method / body / streaming behaviour.

import { createClient } from '@unlighthouse/core/api/client'
import { describe, expect, it, vi } from 'vitest'

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
  it('POST scan.start sends JSON body to /api/scan/start', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      scanId: 'abc',
      site: 'https://example.com',
      startedAt: '2025-01-01T00:00:00.000Z',
    }))
    const client = createClient({ fetch: fetchMock as unknown as typeof fetch })
    const out = await client['scan.start']({ site: 'https://example.com' as any })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/scan/start')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ site: 'https://example.com' })
    expect(init.headers['Content-Type']).toBe('application/json')
    expect((out as any).scanId).toBe('abc')
  })

  it('GET scan.status encodes query string from input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      scanId: 'abc',
      status: 'running',
      discovered: 0,
      scanned: 0,
      failed: 0,
      total: 0,
      startedAt: '2025-01-01T00:00:00.000Z',
      completedAt: null,
    }))
    const client = createClient({ fetch: fetchMock as unknown as typeof fetch })
    await client['scan.status']({ scanId: 'abc' as any })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/scan/status?scanId=abc')
    expect(init.method).toBe('GET')
    expect((init as any).body).toBeUndefined()
  })

  it('GET events.subscribe streams NDJSON chunks as AsyncIterable', async () => {
    const events = [
      { event: 'scan:start', scanId: 'abc', payload: {} },
      { event: 'route:complete', scanId: 'abc', payload: { url: 'https://example.com/' } },
      { event: 'scan:complete', scanId: 'abc', payload: {} },
    ]
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse(events))
    const client = createClient({ fetch: fetchMock as unknown as typeof fetch })
    const iter = client['events.subscribe']({} as any)
    const out: any[] = []
    for await (const ev of iter)
      out.push(ev)
    expect(out).toEqual(events)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/events/subscribe')
    expect(init.method).toBe('GET')
    expect(init.headers.Accept).toBe('application/x-ndjson')
  })

  it('error responses throw with err.name === error.code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(
      { error: { code: 'SCAN_NOT_FOUND', message: 'gone' } },
      404,
    ))
    const client = createClient({ fetch: fetchMock as unknown as typeof fetch })
    await expect(client['scan.status']({ scanId: 'missing' as any })).rejects.toMatchObject({
      name: 'SCAN_NOT_FOUND',
      message: 'gone',
    })
  })

  it('honours a custom baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ scanId: null }))
    const client = createClient({ baseUrl: 'https://host/api', fetch: fetchMock as unknown as typeof fetch })
    await client['scan.current']({} as any)
    expect(fetchMock.mock.calls[0][0]).toBe('https://host/api/scan/current')
  })
})
