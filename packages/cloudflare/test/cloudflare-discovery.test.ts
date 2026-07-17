import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  discoverCloudflarePageLinks,
  readBoundedText,
} from '../src/workflows/discovery'

describe('cloudflare scan discovery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps only same-origin page links and disables automatic redirects', async () => {
    const fetchMock = vi.fn(async () => new Response(`
      <a href="/about#team">About</a>
      <a href="https://other.example/path">Elsewhere</a>
      <a href="/asset.js">Asset</a>
      <a href="mailto:hello@example.com">Mail</a>
    `, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(discoverCloudflarePageLinks({
      pageUrl: 'https://example.com/',
      site: 'https://example.com/',
      config: {},
    })).resolves.toEqual(['https://example.com/about'])
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({
      redirect: 'manual',
    }))
  })

  it('rejects declared and streamed bodies above the byte cap', async () => {
    await expect(readBoundedText(new Response('small', {
      headers: { 'content-length': '6' },
    }), 5)).rejects.toThrow('exceeds 5 bytes')

    const streamed = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6))
        controller.close()
      },
    }))
    await expect(readBoundedText(streamed, 5)).rejects.toThrow('exceeds 5 bytes')
  })
})
