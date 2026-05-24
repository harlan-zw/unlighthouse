# Anthropic / official MCP registry submission

The official MCP registry (<https://registry.modelcontextprotocol.io>) is the
upstream metaregistry that Anthropic, GitHub, Microsoft, and PulseMCP back. It
is the single source of truth — downstream marketplaces (Smithery, MCPMarket,
etc.) aggregate from it. Submitting here first is the highest-leverage move.

Reference: <https://modelcontextprotocol.io/registry> and the schema at
<https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/draft/server.schema.json>.

## server.json — proposed payload

Place this at the repo root (or `packages/unlighthouse/server.json`, then
`cd` into that directory before running `mcp-publisher publish`). It targets
the **already-published** `unlighthouse` npm package, which exposes the
`unlighthouse-mcp` bin.

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json",
  "name": "io.github.harlan-zw/unlighthouse",
  "title": "Unlighthouse",
  "description": "Scan an entire website with Google Lighthouse from your agent.",
  "version": "0.17.7",
  "websiteUrl": "https://unlighthouse.dev",
  "repository": {
    "url": "https://github.com/harlan-zw/unlighthouse",
    "source": "github",
    "subfolder": "packages/unlighthouse"
  },
  "packages": [
    {
      "registryType": "npm",
      "identifier": "unlighthouse",
      "version": "0.17.7",
      "transport": {
        "type": "stdio"
      },
      "runtimeHint": "npx",
      "runtimeArguments": [
        { "type": "positional", "value": "-y" },
        { "type": "positional", "value": "unlighthouse-mcp" }
      ],
      "packageArguments": [
        {
          "type": "named",
          "name": "--site",
          "value": "{site}",
          "variables": {
            "site": {
              "description": "Site URL to scan (e.g. https://example.com)",
              "format": "string",
              "isRequired": true,
              "placeholder": "https://example.com"
            }
          }
        }
      ]
    }
  ]
}
```

Keep `version` aligned with the published `unlighthouse` npm version. Bump it
in lockstep on every npm release that affects the MCP surface.

Description must be 1–100 characters per the schema; the value above is 56.

## Submission steps

```bash
# 1. Install mcp-publisher (Linux/macOS)
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" \
  | tar xz mcp-publisher \
  && sudo mv mcp-publisher /usr/local/bin/

mcp-publisher --help     # smoke-test the binary

# 2. (Optional) Scaffold a fresh server.json — useful if you want to compare
#    against the version checked in here.
cd /tmp && mcp-publisher init
# Then `diff` against packages/mcp/registry/server.json (this file).

# 3. From the repo root, copy the payload above into ./server.json
#    (or symlink: ln -s packages/mcp/registry/server.json server.json).

# 4. Authenticate via GitHub. The namespace `io.github.harlan-zw/*` requires
#    logging in as the `harlan-zw` GitHub account (or running inside a GitHub
#    Action on a harlan-zw repository with the appropriate OIDC permissions).
mcp-publisher login github

# 5. Publish
mcp-publisher publish

# 6. Verify the listing went live
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.harlan-zw/unlighthouse"
```

## Automation (later)

Wire `mcp-publisher publish` into the release workflow alongside `npm publish`
so the registry version never drifts. Use GitHub Actions with OIDC auth —
`mcp-publisher login github-oidc` works inside `harlan-zw/unlighthouse`
workflows without storing any secrets.

## Namespace alternatives

- `io.github.harlan-zw/unlighthouse` (recommended — verified via the GitHub
  account that owns the source repo).
- `dev.unlighthouse/server` (would require DNS or HTTP challenge on
  `unlighthouse.dev`; nicer-looking but needs an extra verification step).

Stick with the GitHub-namespaced name unless the maintainer wants the
domain-scoped one for branding.
