---
scope: Unlighthouse dashboard navigation and agent setup
owns: Words. GLOSSARY.md owns nouns. DESIGN.md owns visuals. VISION.md owns claims.
---

# Copy

This file records reused dashboard strings. Existing copy rules in DESIGN.md remain authoritative for other surfaces.

## Canonical assets

| Asset | String | Where it goes |
| --- | --- | --- |
| Product | Unlighthouse | Brand header, page titles, agent instructions |
| Site collection | Sites | Navigation, breadcrumbs, home title |
| Browse mode | Browse | Sidebar mode, return navigation |
| Agent mode | Agents | Sidebar mode, page title |
| Agent connection | MCP | Setup navigation, setup panel |
| Agent guidance | Skill | Setup navigation, setup panel |
| Scan action | Run scan | Sidebar, site actions, scan form |
| Report action | View report | Scan history, scan links |
| Copy action | Copy instructions | Agent setup controls |

## Register by context

| Context | Register | Example |
| --- | --- | --- |
| Navigation | Short nouns | Sites |
| Buttons | Verb and object | Run scan |
| Empty states | Specific next action | Connect a site to run your first audit |
| Errors | Failure and recovery | Can't reach the scan host |
| Setup | Exact commands and paths | unlighthouse-mcp |

## Copy principles

Follow the existing Voice & Copy section in DESIGN.md.
Setup instructions must match the installed v1 CLI and MCP tool names.
Skill setup uses a manually saved SKILL.md unless an installer ships.

## Banned language

| Never | Use instead | Why |
| --- | --- | --- |
| Hosted MCP connection | Local MCP server | The v1 MCP transport is stdio |
| Install Skill automatically | Save SKILL.md | No Skill installer ships |

## Open questions

Other product surfaces keep their existing strings until a separate copy audit.
