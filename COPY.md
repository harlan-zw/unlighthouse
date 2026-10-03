---
scope: Unlighthouse dashboard navigation, agent setup, and page improvements
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
| Close navigation | Close navigation menu | Mobile drawer close button |
| Navigation drawer title | Navigation menu | Mobile drawer accessible title |
| Report action | View report | Scan history, scan links |
| Copy action | Copy instructions | Agent setup controls |
| Setup prompt disclosure | View setup prompt | Agent setup disclosure |
| Setup prompt region | Setup prompt | Agent setup accessible region |
| Route ranking | Lowest overall scores | Scan Overview |
| Route ranking scope | Up to 5 audited URL/device entries, ranked by overall score. | Scan Overview |
| Overall score | Overall score | Route and template rankings |
| Templates | Template groups | Scan Overview |
| Template ranking scope | Up to 5 groups, ranked by average overall score. | Scan Overview |
| Entry count | URL/device entries | Template ranking |
| Unmatched group | Unmatched routes | Template ranking |
| Score basis | Overall score averages Performance, Accessibility, SEO, and Best Practices when scores exist. | Scan Overview |
| Empty route ranking | No scored routes in this view. | Scan Overview |
| Empty template ranking | No template groups in this view. | Scan Overview |
| Unknown device | Unknown device | Route ranking |
| Fix ranking | Top Core Web Vitals fixes | Scan Overview |
| Savings scope | Maximum estimated savings on one route. Estimates are not additive. | Scan Overview |
| Combined fixes scope | For combined results, fixes use mobile when both devices exist. | Scan Overview |
| Selected pack scope | Pack totals summarize audited URLs for {device}. | Pack page |
| CWV action | View Core Web Vitals | Scan Overview |
| Fix loading | Loading Core Web Vitals fixes | Scan Overview |
| Fix refresh | Refreshing Core Web Vitals fixes | Scan Overview |
| Empty fixes | No estimated fixes in this report. | Scan Overview |
| Unavailable fixes | Core Web Vitals report unavailable | Scan Overview |
| Measurement disclosure | Measurement details | Route detail |
| Affected links loading | Loading affected route links | Pack findings |
| Measurement fields | Captured at; Lighthouse version; Benchmark index; User agent; Audit duration; Lighthouse warnings; Recorded device | Route detail |
| History comparison | Compare with older scan | Site history |
| Comparison scope | Comparisons use older completed scans for the selected device from loaded history. | Site history |
| Missing loaded baseline | No older eligible scan in loaded history. | Site history |

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
