export interface PagesSite {
  origin: string
  hits: Map<string, number>
  stop(): void
}

function page(title: string, links: string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${title} of the Unlighthouse fixture site">
<title>${title}</title>
</head>
<body>
<h1>${title}</h1>
<p>A small page for Unlighthouse tests.</p>
<ul>${links.map(link => `<li><a href="${link}">${link}</a></li>`).join('')}</ul>
</body>
</html>`
}

export function servePages(paths: string[], options: { broken?: string[] } = {}): PagesSite {
  const hits = new Map<string, number>()
  const links = [...paths, ...(options.broken ?? [])]
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const path = new URL(request.url).pathname
      hits.set(path, (hits.get(path) ?? 0) + 1)
      if (path === '/robots.txt')
        return new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } })
      if (!paths.includes(path))
        return new Response('not found', { status: 404 })
      return new Response(page(path === '/' ? 'Home' : path, links), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  })
  return { origin: `http://127.0.0.1:${server.port}`, hits, stop: () => server.stop(true) }
}

if (import.meta.main) {
  const site = servePages(['/', '/about', '/contact'])
  console.log(site.origin)
}
