import index from './index.html'

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env['PORT'] ?? 0),
  development: true,
  routes: {
    '/api/*': Response.json({ ok: false, error: { code: 'NOT_FOUND', message: 'The preview has no API; open it with ?mock' } }, { status: 404 }),
    '/*': index,
  },
})

console.log(`Unlighthouse UI preview: ${new URL('/?mock', server.url).href}`)
