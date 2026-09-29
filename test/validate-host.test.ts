import type { ResolvedUserConfig } from '@unlighthouse/core'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateHost } from '../packages/cli/src/util'

// two local origins stand in for http://example.com redirecting to https://www.example.com
let target: Server
let source: Server
let targetOrigin = ''
let sourceOrigin = ''

function listen(server: Server) {
  return new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
}

beforeAll(async () => {
  target = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<html></html>')
  })
  targetOrigin = `http://127.0.0.1:${await listen(target)}`
  source = createServer((req, res) => {
    const location = req.url === '/file' ? '/index.php' : `${targetOrigin}/`
    if (req.url === '/index.php') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html></html>')
      return
    }
    res.writeHead(301, { location })
    res.end()
  })
  sourceOrigin = `http://localhost:${await listen(source)}`
})

afterAll(() => {
  target.close()
  source.close()
})

const config = (site: string) => ({ site, lighthouseOptions: {} }) as ResolvedUserConfig

describe('validateHost', () => {
  it('adopts a redirect to another host', async () => {
    const resolvedConfig = config(sourceOrigin)
    await validateHost(resolvedConfig)
    expect(new URL(resolvedConfig.site).origin).toBe(targetOrigin)
  })

  it('keeps the site when the redirect goes to a file', async () => {
    const resolvedConfig = config(`${sourceOrigin}/file`)
    await validateHost(resolvedConfig)
    expect(resolvedConfig.site).toBe(`${sourceOrigin}/file`)
  })
})
