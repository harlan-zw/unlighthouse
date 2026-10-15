import { deflateSync } from 'node:zlib'

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)) >>> 0)
  return out
}

export function noisyPng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const row = 1 + width * 3
  const raw = new Uint8Array(row * height)
  let seed = 42
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
      const i = y * row + 1 + x * 3
      raw[i] = (x * 255 / width + (seed & 63)) & 255
      raw[i + 1] = (y * 255 / height + ((seed >> 6) & 63)) & 255
      raw[i + 2] = (seed >> 12) & 255
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 2, 0, 0, 0], 8)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 1 }))),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const PROBLEM_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unlighthouse fixture</title>
<script src="/blocking.js"></script>
</head>
<body>
<h1>Unlighthouse fixture page</h1>
<p>This page has deliberate problems: a large unoptimized image, a render-blocking script, an image without alt text and no meta description.</p>
<img src="/hero.png" width="320" height="240">
<p><a href="/other">Another page</a></p>
</body>
</html>`

const AUTH_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Auth probe</title></head>
<body>
<p>auth probe</p>
<script>
fetch('/beacon?local=' + encodeURIComponent(localStorage.getItem('token') || '') + '&session=' + encodeURIComponent(sessionStorage.getItem('tab') || ''))
</script>
</body>
</html>`

const BUSY_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Busy</title><meta name="description" content="Main-thread work"></head>
<body>
<h1 id="out">Busy page</h1>
<script>
function spin(n) { let x = 0; for (let i = 0; i < n * 400000; i++) x += Math.sqrt(i ^ x); return x }
spin(120)
setTimeout(() => { spin(120); document.getElementById('out').textContent = 'Busy page ready' }, 0)
setTimeout(() => spin(120), 50)
</script>
</body>
</html>`

export interface FixtureSite {
  origin: string
  requests: Array<{ path: string, cookie: string | null, headers: Record<string, string>, query: Record<string, string> }>
  stop(): void
}

export function serveFixture(): FixtureSite {
  const hero = noisyPng(1000, 750)
  const blockingJs = `${'/* padding */\n'.repeat(2000)}window.__fixture = Date.now();\n`
  const requests: FixtureSite['requests'] = []
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url)
      requests.push({
        path: url.pathname,
        cookie: request.headers.get('cookie'),
        headers: Object.fromEntries(request.headers),
        query: Object.fromEntries(url.searchParams),
      })
      switch (url.pathname) {
        case '/':
        case '/other':
          return new Response(PROBLEM_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        case '/blocking.js':
          await Bun.sleep(300)
          return new Response(blockingJs, { headers: { 'content-type': 'text/javascript' } })
        case '/hero.png':
          return new Response(hero, { headers: { 'content-type': 'image/png' } })
        case '/auth':
          return new Response(AUTH_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        case '/busy':
          return new Response(BUSY_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        case '/stall':
          return new Promise<Response>(() => {})
        case '/error':
          return new Response('<!doctype html><title>boom</title><p>server error', { status: 500, headers: { 'content-type': 'text/html' } })
        case '/spa':
          return new Response(`<!doctype html><html lang="en"><head><title>SPA</title></head><body><div id="app"></div><script>setTimeout(() => { document.getElementById('app').innerHTML = '<a href="/rendered-link">rendered</a>' }, 50)</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        case '/login':
          return new Response(`<!doctype html><html lang="en"><head><title>Login</title></head><body><form method="post" action="/session"><input name="user" aria-label="user"><button>Sign in</button></form></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        case '/session':
          return new Response(null, { status: 303, headers: { 'location': '/', 'set-cookie': 'sid=from-login; Path=/; HttpOnly' } })
        case '/beacon':
          return new Response('ok')
        default:
          return new Response('not found', { status: 404 })
      }
    },
  })
  return {
    origin: `http://127.0.0.1:${server.port}`,
    requests,
    stop: () => server.stop(true),
  }
}
