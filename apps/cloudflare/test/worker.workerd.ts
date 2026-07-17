import type { D1Migration } from 'cloudflare:test'
import { applyD1Migrations, SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'
import { authenticateRequest, unauthorizedResponse } from '../src/auth'
import { createAllowedTargetPolicy } from '../src/target-policy'

const token = 'test-token-with-at-least-32-characters-long'

declare module 'cloudflare:workers' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[]
  }
}

describe('Cloudflare app security boundary', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  })

  it('enforces authentication at the production Worker entrypoint', async () => {
    const response = await SELF.fetch('https://unlighthouse.test/api/manifest')
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('challenges browsers and API clients without caching the response', () => {
    const response = unauthorizedResponse()
    const challenge = response.headers.get('www-authenticate')
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(challenge).toContain('Basic realm="Unlighthouse"')
    expect(challenge).toContain('Bearer realm="Unlighthouse"')
  })

  it('accepts Bearer and browser-friendly Basic credentials as one principal', async () => {
    const bearer = await authenticateRequest(new Request('https://example.com/api/manifest', {
      headers: { authorization: `Bearer ${token}` },
    }), token)
    const basic = await authenticateRequest(new Request('https://example.com/', {
      headers: { authorization: `Basic ${btoa(`unlighthouse:${token}`)}` },
    }), token)
    expect(bearer).toEqual(basic)
    expect(bearer?.principal).toMatch(/^token:[a-f0-9]{16}$/)
  })

  it('rejects wrong credentials without exposing a token-derived key', async () => {
    const result = await authenticateRequest(new Request('https://example.com/', {
      headers: { authorization: 'Bearer wrong-token' },
    }), token)
    expect(result).toBeNull()
  })

  it('allows only configured public origins', () => {
    const allowed = createAllowedTargetPolicy('https://example.com,https://docs.example.com:8443')
    expect(allowed('https://example.com/path')).toBe(true)
    expect(allowed('https://docs.example.com:8443/report')).toBe(true)
    expect(allowed('https://attacker.example/path')).toBe(false)
    expect(allowed('http://127.0.0.1/admin')).toBe(false)
    expect(allowed('http://169.254.169.254/latest/meta-data')).toBe(false)
  })

  it('runs the checked-in schema against a real workerd D1 binding', async () => {
    const row = await env.DB.prepare(
      'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'scans\'',
    ).first<{ name: string }>()
    expect(row).toEqual({ name: 'scans' })
  })

  it('streams bytes through a real workerd R2 binding', async () => {
    await env.BLOBS.put('workerd/artifact.txt', 'streamed')
    const object = await env.BLOBS.get('workerd/artifact.txt')
    expect(object).not.toBeNull()
    await expect(new Response(object?.body).text()).resolves.toBe('streamed')
  })

  it('calls the rate limiter Durable Object over typed RPC', async () => {
    const limiter = env.RATE_LIMITER_DO.getByName('workerd-principal')
    const result = await limiter.consume('workerd-principal', 1)
    expect(result).toMatchObject({ ok: true, limit: 10, remaining: 9 })
  })
})
