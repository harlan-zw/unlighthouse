export interface AgentSetup {
  root: string
  site?: string
}

export type AgentSetupResult
  = | { _tag: 'Incomplete' }
    | { _tag: 'InvalidRoot' }
    | { _tag: 'InvalidSite' }
    | { _tag: 'Ready', setup: AgentSetup }

export function parseAgentSetup(input: { root: string, site: string }): AgentSetupResult {
  const root = input.root.trim()
  const site = input.site.trim()
  if (!root)
    return { _tag: 'Incomplete' }
  if (!/^(?:\/|[a-z]:[\\/]|\\\\)/i.test(root))
    return { _tag: 'InvalidRoot' }
  if (site && (!URL.canParse(site) || !/^https?:\/\//i.test(site)))
    return { _tag: 'InvalidSite' }
  return { _tag: 'Ready', setup: { root, ...(site ? { site } : {}) } }
}

export function agentShell(setup: AgentSetup): 'PowerShell' | 'POSIX shell' {
  return /^(?:[a-z]:[\\/]|\\\\)/i.test(setup.root) ? 'PowerShell' : 'POSIX shell'
}

function shellQuote(value: string, shell: ReturnType<typeof agentShell>): string {
  return `'${value.replaceAll('\'', shell === 'PowerShell' ? '\'\'' : '\'\\\'\'')}'`
}

export function buildMcpArgs(setup: AgentSetup): string[] {
  return ['--root', setup.root, ...(setup.site ? ['--site', setup.site] : [])]
}

export function buildClaudeCommand(setup: AgentSetup): string {
  return `claude mcp add unlighthouse -- unlighthouse-mcp ${buildMcpArgs(setup).map(value => shellQuote(value, agentShell(setup))).join(' ')}`
}

export function buildMcpConfig(setup: AgentSetup): string {
  return JSON.stringify({
    mcpServers: {
      unlighthouse: {
        command: 'unlighthouse-mcp',
        args: buildMcpArgs(setup),
      },
    },
  }, null, 2)
}

export const agentSkill = `---
name: unlighthouse
description: Read sitewide Lighthouse scan history, audit packs, and route details through Unlighthouse MCP.
---

# Unlighthouse

Use the configured Unlighthouse MCP server for sitewide Lighthouse audits.

1. Call pack_list to discover the available audit packs.
2. Call history_list to find existing scans for the configured site.
3. Call scan_summary for the selected scan.
4. Call pack_run with the scan ID and a relevant pack name.
5. Call query_routes or route_get to inspect affected routes.

Report the highest impact findings first. Include affected routes and concrete fixes.
Use tool results as evidence. State when a scan or metric is unavailable.

If the user requests a fresh scan, call scan_start with the site URL.
Poll scan_status until the scan completes before reading its results.
If a scan is already active, poll its status rather than starting another scan.
`

export function buildAgentPrompt(setup: AgentSetup): string {
  return `Set up Unlighthouse MCP, then read the existing scan history${setup.site ? ` for ${setup.site}` : ''}.

Use the v1 Unlighthouse installation that provides the unlighthouse-mcp executable.
Check that this executable is available to the MCP client. If it is missing, stop and report that requirement.
The project root is ${JSON.stringify(setup.root)}. It contains the Unlighthouse config and scan output.

For Claude Code in ${agentShell(setup)}, run:
${buildClaudeCommand(setup)}

For another MCP client, merge this into its MCP server configuration:
${buildMcpConfig(setup)}

Restart or reconnect the MCP client after saving its configuration.
Call pack_list, history_list, then scan_summary for the latest completed scan.
Run a relevant audit pack and report the highest impact findings with affected routes.
If no completed scan exists, report that and ask before starting a scan.`
}
