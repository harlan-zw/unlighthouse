# Smithery submission

Smithery (<https://smithery.ai>) is the largest community catalog of MCP servers.
The current Smithery CLI publishes servers either by URL (remote MCP) or as an
MCPB bundle (local stdio). Unlighthouse ships a stdio binary
(`unlighthouse-mcp`) inside the `unlighthouse` npm package, so the maintainer
has two options:

1. Publish a thin wrapper / MCPB bundle pointing at `npx unlighthouse-mcp`.
2. Publish only via the official MCP metaregistry (see `ANTHROPIC.md`) and let
   Smithery mirror from there — Smithery is a downstream aggregator of the
   metaregistry.

Option 2 is recommended for the first cut: one source of truth, zero
duplication, and Smithery will pick the entry up automatically once it lands
upstream.

If the maintainer wants a Smithery-native listing too (e.g. to control the
display name, screenshots, or category), use the payload below.

<!-- needs maintainer verification -->
Smithery historically supported a `smithery.yaml` at the repo root for stdio
servers, but the current public docs (<https://smithery.ai/docs/concepts/cli.md>,
fetched 2026-05) describe only the `smithery mcp publish <url|bundle>` flow.
The YAML below is preserved for the maintainer to test against the current
deployer — if Smithery rejects it, fall back to the CLI flow further down.

## smithery.yaml (legacy stdio publish format)

Place this at the repo root **only if** Smithery's current deployer still
accepts it. Verify by running `smithery mcp publish --dry-run` first.

```yaml
# smithery.yaml
# Schema reference: https://smithery.ai/docs/build
runtime: "node"
startCommand:
  type: stdio
  command: npx
  args:
    - "-y"
    - "unlighthouse-mcp"
    - "--site"
    - "{site}"
  configSchema:
    type: object
    properties:
      site:
        type: string
        description: "Site URL to scan (e.g. https://example.com)"
        format: uri
    required: [site]
```

## Submission steps

```bash
# 1. Install the Smithery CLI
npm install -g smithery@latest      # run from Node 24.13.1+ for this repo

# 2. Authenticate (opens browser for OAuth)
smithery auth login

# 3. Confirm namespace ownership
smithery namespace list
smithery namespace use harlan-zw    # or @unlighthouse, if claimed

# 4. Publish — pick ONE of the two flows below

#    a) MCPB bundle flow (preferred for stdio servers):
#       Build an MCPB archive that wraps `npx unlighthouse-mcp` and run:
smithery mcp publish ./unlighthouse.mcpb -n harlan-zw/unlighthouse

#    b) URL flow (only if a hosted HTTP transport is added later):
smithery mcp publish "https://mcp.unlighthouse.dev" -n harlan-zw/unlighthouse \
  --config-schema '{"type":"object","properties":{"site":{"type":"string","format":"uri"}},"required":["site"]}'

# 5. Verify the listing
smithery mcp search unlighthouse
```

## Category

Request the `Site Performance` category at submission time (see
`CATEGORY-PROPOSAL.md`). The Smithery UI exposes category selection in the
post-publish dashboard at <https://smithery.ai/server/harlan-zw/unlighthouse>.
If the category does not exist yet, ping the Smithery team via the issue
tracker at <https://github.com/smithery-ai/registry> and reference
`CATEGORY-PROPOSAL.md`.

## What goes in the listing description

Copy the "Tools" section from `packages/mcp/README.md` (auto-generated from
the command registry) plus the example Claude Code session, so users see
exactly what the server exposes before they install.
