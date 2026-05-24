# MCPMarket submission

MCPMarket (<https://mcpmarket.com>) is a community-curated MCP catalog. At the
time this document was authored, MCPMarket's public site was rate-limiting
WebFetch requests and no public submission API or schema was reachable.

<!-- needs maintainer verification -->
The fields below are the maintainer's best estimate of MCPMarket's listing
metadata, modelled after the fields visible on existing public listings
(name, description, homepage, install command, tools). The maintainer should
confirm exact field names with MCPMarket support before pasting into the
submission form or PR.

## manifest.json — proposed payload

```json
{
  "name": "unlighthouse",
  "displayName": "Unlighthouse",
  "description": "Scan an entire website with Google Lighthouse and inspect performance, accessibility, SEO, and best-practices results from any MCP client.",
  "homepage": "https://unlighthouse.dev",
  "repository": "https://github.com/harlan-zw/unlighthouse",
  "license": "MIT",
  "author": "Harlan Wilton",
  "category": "Site Performance",
  "tags": ["lighthouse", "performance", "seo", "accessibility", "audit", "web-vitals"],
  "transport": "stdio",
  "install": {
    "npm": "npx -y unlighthouse-mcp --site <SITE_URL>"
  },
  "configSchema": {
    "type": "object",
    "properties": {
      "site": {
        "type": "string",
        "format": "uri",
        "description": "Site to scan, e.g. https://example.com"
      }
    },
    "required": ["site"]
  },
  "tools": [
    "scan_start", "scan_status", "scan_cancel", "scan_pause", "scan_resume",
    "scan_delete", "scan_results", "scan_summary", "scan_meta", "scan_current",
    "scan_rescanAll",
    "route_get", "route_rescan",
    "history_list", "history_get", "history_delete", "history_rescan",
    "compare_run", "compare_markdown", "compare_findPrevious",
    "assert_evaluate",
    "pack_run", "pack_list",
    "query_routes",
    "events_subscribe", "events_tail",
    "manifest", "health",
    "auditors_list", "auditors_test",
    "sites_list", "sites_get", "sites_create", "sites_delete"
  ]
}
```

## Submission steps

1. Open <https://mcpmarket.com> and find the **Submit a server** link
   (typically in the site footer). If no public form is found, file an issue
   on the MCPMarket community repo or email the listed contact address.
2. Paste the manifest fields above into the corresponding form fields.
3. For "Install command" use exactly:

   ```bash
   npx -y unlighthouse-mcp --site https://example.com
   ```

4. Attach a screenshot of the dashboard (any scan from `unlighthouse.dev` is
   fine).
5. Link the MCP-focused README at
   <https://github.com/harlan-zw/unlighthouse/blob/main/packages/mcp/README.md>.
6. Tick "Site Performance" as the category — if the form's dropdown has no
   such entry, leave a free-text note referencing
   `packages/mcp/registry/CATEGORY-PROPOSAL.md`.

## Updates

When `unlighthouse` ships a new version that materially changes the tool
surface (added or removed commands), bump the manifest's implicit version by
re-submitting. MCPMarket pulls the latest npm metadata for the install
command, so a plain `npm publish` of `unlighthouse` is otherwise sufficient.
