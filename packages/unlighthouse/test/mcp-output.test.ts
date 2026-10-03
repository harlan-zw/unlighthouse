import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { buildCliContext } from '../src/cli/ctx'
import { runMcp } from '../src/cli/mcp'

vi.mock('@unlighthouse/mcp', () => ({ startStdioServer: async () => {} }))
vi.mock('../src/runtime-download', async (original) => {
  const actual = await original<typeof import('../src/runtime-download')>()
  return { ...actual, downloadDependencies: async (_names: string[], options: { logger?: { info?: (message: string) => void } }) => {
    options.logger?.info?.('Fixture SDK download')
    return (specifier: string) => specifier
  } }
})

it('keeps projected CLI diagnostics off agent stdout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-agent-output-'))
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    await buildCliContext({ root, site: 'https://example.com', debug: true, env: { UNLIGHTHOUSE_BLOBS_DRIVER: 'memory' } })
    expect(stdout.mock.calls).toEqual([])
    expect(stderr.mock.calls.map(call => String(call[0])).join('')).toContain('Opening SQLite')
  }
  finally {
    stdout.mockRestore()
    stderr.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})

it('keeps MCP diagnostics and dependency download messages off stdout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-mcp-output-'))
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    await runMcp(['--root', root, '--site', 'https://example.com', '--debug'], { UNLIGHTHOUSE_BLOBS_DRIVER: 'memory' })
    expect(stdout.mock.calls).toEqual([])
    expect(stderr.mock.calls.map(call => String(call[0])).join('')).toContain('Fixture SDK download')
  }
  finally {
    stdout.mockRestore()
    stderr.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
