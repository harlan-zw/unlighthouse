import { describe, expect, it } from 'vitest'
import { buildClaudeCommand, buildMcpConfig, parseAgentSetup } from '../app/features/agents/setup'

describe('agent setup', () => {
  it('waits for a project root', () => {
    expect(parseAgentSetup({ root: ' ', site: '' })).toEqual({ _tag: 'Incomplete' })
  })

  it.each(['./project', '~/project', 'C:project'])('rejects a relative root: %s', (root) => {
    expect(parseAgentSetup({ root, site: '' })).toEqual({ _tag: 'InvalidRoot' })
  })

  it.each(['/srv/project', 'C:\\Users\\someone\\project', '\\\\server\\share'])('accepts an absolute root: %s', (root) => {
    expect(parseAgentSetup({ root, site: '' })).toEqual({ _tag: 'Ready', setup: { root } })
  })

  it.each(['example.com', 'ftp://example.com', 'https://', 'javascript:alert(1)'])('rejects an invalid scan URL: %s', (site) => {
    expect(parseAgentSetup({ root: '/srv/project', site })).toEqual({ _tag: 'InvalidSite' })
  })

  it('retains a local site port and trims pasted input', () => {
    expect(parseAgentSetup({ root: ' /srv/project ', site: ' http://localhost:3000 ' })).toEqual({
      _tag: 'Ready',
      setup: { root: '/srv/project', site: 'http://localhost:3000' },
    })
  })

  it('quotes Windows paths for PowerShell', () => {
    expect(buildClaudeCommand({ root: 'C:\\Users\\A\'s project' })).toBe(
      'claude mcp add unlighthouse -- unlighthouse-mcp \'--root\' \'C:\\Users\\A\'\'s project\'',
    )
  })

  it('keeps paths and the chosen site in a usable MCP client config', () => {
    const result = JSON.parse(buildMcpConfig({ root: 'C:\\Users\\A\'s project', site: 'http://localhost:3000' }))
    expect(result.mcpServers.unlighthouse).toEqual({
      command: 'unlighthouse-mcp',
      args: ['--root', 'C:\\Users\\A\'s project', '--site', 'http://localhost:3000'],
    })
  })
})
