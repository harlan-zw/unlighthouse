import type { AddressInfo } from 'node:net'
import type { ResolvedUserConfig } from '../src/types'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLogger } from '../src/logger'
import { fetchUrlRaw } from '../src/util'

const server = createServer((req, res) => {
  if (req.url === '/old') {
    res.writeHead(301, { location: '/new' })
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<html></html>')
})
let origin = ''
const config = { lighthouseOptions: {} } as ResolvedUserConfig

beforeAll(async () => {
  createLogger()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

describe('fetchUrlRaw', () => {
  it('does not report a redirect when only the trailing slash differs', async () => {
    const { valid, redirected } = await fetchUrlRaw(origin, config)
    expect(valid).toBe(true)
    expect(redirected).toBe(false)
  })

  it('reports a real redirect', async () => {
    const { redirected, redirectUrl } = await fetchUrlRaw(`${origin}/old`, config)
    expect(redirected).toBe(true)
    expect(redirectUrl).toBe(`${origin}/new`)
  })
})
