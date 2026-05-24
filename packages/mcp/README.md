# @unlighthouse/mcp

[Model Context Protocol](https://modelcontextprotocol.io) projection of the
Unlighthouse command registry. Lets MCP-aware agents (Claude Code, Claude
Desktop, Continue, Cursor, Zed, etc.) drive whole-site Lighthouse scans,
inspect history, run packs, and compare runs.

The published binary is `unlighthouse-mcp`, shipped from the parent
[`unlighthouse`](https://www.npmjs.com/package/unlighthouse) npm package.
This workspace package is the projection layer; end users do not install
`@unlighthouse/mcp` directly.

## Install

The MCP server is bundled with the `unlighthouse` CLI — no separate install
needed. Either run it via `npx` on demand:

```bash
npx -y unlighthouse-mcp --site https://example.com
```

…or add it globally:

```bash
npm install -g unlighthouse
unlighthouse-mcp --site https://example.com
```

## Configure

### Claude Code

Add the server with the `claude mcp add` CLI:

```bash
claude mcp add unlighthouse -s user \
  -- npx -y unlighthouse-mcp --site https://example.com
```

Or edit `~/.claude.json` directly:

```jsonc
{
  "mcpServers": {
    "unlighthouse": {
      "command": "npx",
      "args": ["-y", "unlighthouse-mcp", "--site", "https://example.com"]
    }
  }
}
```

### Claude Desktop / Cursor / Zed

The same JSON block goes in each host's settings file. The two flags that
matter:

- `--site <url>` — site to point the storage layer at. Without it the server
  auto-discovers any `.unlighthouse/<host>/` directory in CWD that already
  has scans on disk.
- `--root <path>` — override CWD (useful for global installs).
- `--debug` — verbose stderr logs.

## Tools

The MCP surface is generated from the command registry in
[`@unlighthouse/contracts/commands`](../contracts/src/commands/index.ts).
Tool names are the command name with `.` → `_` (e.g. `scan.start` →
`scan_start`). Currently exposed:

| Group       | Tools                                                                                              |
|-------------|----------------------------------------------------------------------------------------------------|
| Scan        | `scan_start`, `scan_status`, `scan_cancel`, `scan_pause`, `scan_resume`, `scan_delete`, `scan_results`, `scan_summary`, `scan_meta`, `scan_current`, `scan_rescanAll` |
| Route       | `route_get`, `route_rescan`                                                                        |
| History     | `history_list`, `history_get`, `history_delete`, `history_rescan`                                  |
| Compare     | `compare_run`, `compare_markdown`, `compare_findPrevious`                                          |
| Assert      | `assert_evaluate`                                                                                  |
| Pack        | `pack_run`, `pack_list`                                                                            |
| Query       | `query_routes`                                                                                     |
| Events      | `events_subscribe`, `events_tail`                                                                  |
| Meta        | `manifest`, `health`, `auditors_list`, `auditors_test`                                             |
| Sites       | `sites_list`, `sites_get`, `sites_create`, `sites_delete`                                          |

For each tool's argument schema, call `manifest` from your agent or read the
source: [`packages/contracts/src/commands/`](../contracts/src/commands/).

## Example Claude Code session

```text
You: scan https://example.com and tell me the worst performance offenders

Claude: I'll start a scan and report once routes finish auditing.
  [calls scan_start with { site: "https://example.com" }]
  [calls scan_status — sees 12/24 routes done]
  [waits, calls scan_status again — 24/24]
  [calls pack_run with { pack: "cwv", scanId: "<id>" }]

  Worst LCP routes:
    /products/featured  — 4.8s
    /blog/long-post     — 4.2s
    /search?q=...       — 3.9s

  Common root cause: render-blocking <link rel="stylesheet"> at line 42 of
  the shared layout. Want me to open a diff against the previous scan to
  confirm this is a regression?

You: yes please

Claude: [calls compare_findPrevious + compare_markdown]
  This is a regression vs scan from 3 days ago — LCP was 1.8s on /products/featured
  before today's deploy.
```

## Demo video

<!-- TODO video — record Claude Code driving a whole-site scan end-to-end. -->

## How it works

`projection.ts` walks the command registry, converts each command's `zod`
input schema to JSON Schema, and registers it as an MCP tool. On call, the
projection runs the command's handler with a per-request `HandlerCtx`. If the
handler returns an async iterable and the client passed a `progressToken`,
each chunk is emitted as a `notifications/progress` message; otherwise the
chunks are collected into a JSON array.

Errors raised by handlers are mapped to MCP error codes:

| Internal code        | MCP code              |
|----------------------|-----------------------|
| `NOT_SUPPORTED`      | `MethodNotFound`      |
| `INPUT_INVALID`      | `InvalidParams`       |
| `CONFIG_INVALID`     | `InvalidParams`       |
| (anything else)      | `InternalError`       |

## Registry submissions

This package is in flight for submission to public MCP catalogs. Authoring
payloads live in [`./registry/`](./registry/):

- [`SMITHERY.md`](./registry/SMITHERY.md) — Smithery (smithery.ai).
- [`MCPMARKET.md`](./registry/MCPMARKET.md) — MCPMarket (mcpmarket.com).
- [`ANTHROPIC.md`](./registry/ANTHROPIC.md) — Official MCP metaregistry
  (registry.modelcontextprotocol.io).
- [`CATEGORY-PROPOSAL.md`](./registry/CATEGORY-PROPOSAL.md) — Pitch for a
  "Site Performance" category, audience and scope.

Tracking issue: [harlan-zw/unlighthouse#349](https://github.com/harlan-zw/unlighthouse/issues/349)
(Phase 14 — MCP positioning).

## License

MIT.
