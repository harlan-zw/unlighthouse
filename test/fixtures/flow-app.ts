import type { Server } from 'bun'

export interface FlowApp {
  origin: string
  server: Server<undefined>
  stop(): void
}

const HOME = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A small shop used to test user flows">
  <title>Flow shop</title>
</head>
<body>
  <main>
    <h1>Flow shop</h1>
    <form action="/results" method="get">
      <label for="q">Search</label>
      <input id="q" name="q" type="text" autocomplete="off">
      <button type="submit">Search</button>
    </form>
    <p id="suggestions" aria-live="polite"></p>
    <button id="add" type="button">Add to cart</button>
    <p id="cart">Cart: 0</p>
  </main>
  <script>
    function block(ms) {
      const end = performance.now() + ms
      while (performance.now() < end) {}
    }
    document.getElementById('q').addEventListener('input', (event) => {
      block(120)
      document.getElementById('suggestions').textContent = 'Suggestions for ' + event.target.value
    })
    let count = 0
    document.getElementById('add').addEventListener('click', () => {
      block(150)
      document.getElementById('cart').textContent = 'Cart: ' + (++count)
    })
  </script>
</body>
</html>`

function results(query: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Results</title>
</head>
<body><main><h1>Results for ${Bun.escapeHTML(query)}</h1><ul><li>Shoe one</li><li>Shoe two</li></ul></main></body>
</html>`
}

export function serveFlowApp(): FlowApp {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const html = { 'content-type': 'text/html; charset=utf-8' }
      if (url.pathname === '/')
        return new Response(HOME, { headers: html })
      if (url.pathname === '/results')
        return new Response(results(url.searchParams.get('q') ?? ''), { headers: html })
      return new Response('Not found', { status: 404 })
    },
  })
  return { origin: `http://127.0.0.1:${server.port}`, server, stop: () => server.stop(true) }
}
