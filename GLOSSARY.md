# Glossary

Scope: dashboard navigation. Terms follow existing routes, contracts, and the requested Browse and Agents modes.

## Map

| Term | Parent | Source | Owner | Cardinality | Customer word |
| --- | --- | --- | --- | --- | --- |
| Site | Workspace | sites.list | Sites | Many | Site |
| Scan | Site | history.list | Scans | Many | Scan |
| Pack | Scan | pack.list | Scans | Many | Pack |
| Browse | Workspace | Sidebar navigation | UI | One mode | Browse |
| Agents | Workspace | Agent setup page | UI | One mode | Agents |
| MCP | Agents | packages/mcp | MCP | One transport | MCP |
| Skill | Agents | SKILL.md instructions | UI | One setup | Skill |

Collisions: none in the navigation scope.

## Terms

### Site
**Is:** a scan origin, identified in routes by host and port.
**Use for:** the registry and scan history for an origin.
**Never:** project when referring to a Site.
**Casing:** Site in headings, site in prose.

### Scan
**Is:** one audit execution with an ID and stored results.
**Use for:** scan history, progress, and results.
**Never:** session when referring to a Scan.
**Casing:** Scan in headings, scan in prose.

### Pack
**Is:** a registered group of audit findings.
**Use for:** pack.list entries and scan pack pages.
**Never:** plugin when referring to a Pack.
**Casing:** Pack in headings, pack in prose.

### Browse
**Is:** the mode for Sites, Scans, and Packs.
**Use for:** sidebar mode navigation.
**Never:** Explorer as a replacement mode label.
**Casing:** Browse.

### Agents
**Is:** the mode for local agent connection and guidance.
**Use for:** MCP and Skill setup.
**Never:** AI workspace as a replacement mode label.
**Casing:** Agents.

### MCP
**Is:** the local stdio server exposing Unlighthouse commands to agents.
**Use for:** unlighthouse-mcp setup.
**Never:** hosted endpoint when referring to this server.
**Casing:** MCP.

### Skill
**Is:** reusable agent instructions saved in SKILL.md.
**Use for:** the manual agent guidance setup.
**Never:** automatic installer when referring to this setup.
**Casing:** Skill in headings, skill in prose.

## Banned

Bans apply only to replacement labels for these concepts, not frozen identifiers or existing audit names.

## Open questions

Terms outside dashboard navigation retain their existing meanings.
