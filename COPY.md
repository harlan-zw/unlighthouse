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
| Fix ranking | Lighthouse insights | Scan Overview |
| Savings scope | Maximum estimated savings on one route. Estimates are not additive. | Scan Overview |
| Combined fixes scope | For combined results, fixes use mobile when both devices exist. | Scan Overview |
| Selected pack scope | Pack totals summarize audited URLs for {device}. | Pack page |
| CWV action | View performance metrics | Scan Overview |
| Fix loading | Loading performance metrics | Scan Overview |
| Fix refresh | Refreshing performance metrics | Scan Overview |
| Empty fixes | No estimated fixes in this report. | Scan Overview |
| Unavailable fixes | Performance metrics report unavailable | Scan Overview |
| Measurement disclosure | Measurement details | Route detail |
| Affected links loading | Loading affected route links | Pack findings |
| Measurement fields | Captured at; Lighthouse version; Benchmark index; User agent; Audit duration; Lighthouse warnings; Recorded device | Route detail |
| History comparison | Compare with older scan | Site history |
| Comparison scope | Comparisons use older completed scans for the selected device from loaded history. | Site history |
| Missing loaded baseline | No older eligible scan in loaded history. | Site history |
| Performance metrics | Performance metrics | Mixed metric headings and cwv pack |
| Performance history | Performance metrics history | Comparison summary |
| Performance comparison | Performance metrics comparison | Comparison table |
| Poor performance filter | Poor performance metrics | Routes table |
| Below 90 filter | Below 90 | Routes table |
| Below 90 scope | At least one category score below 90 | Routes table |
| Middle score band | Needs improvement | Category score distributions |
| Passed audits | Passed audits | Only actual passed checks |
| Manual checks | Additional items to manually check | Page audit details |
| Not applicable audits | Not applicable | Page audit details |
| Audit information | Informative audits | Page audit details |
| Audit errors | Audit errors | Page audit details |
| Unknown audit results | Unknown audit results | Unrecoverable historical results |
| Missing category reports | No reports available for this category | No eligible reports were read |
| Empty available findings | No findings in available reports | Available reports contain no displayed findings |
| Partial report coverage | Reports available for {analysed} of {eligible} entries | Pack summaries |
| Missing reports | {missing} reports unavailable | Partial pack summaries |
| Manual assessment reminder | Automated checks do not cover every accessibility requirement. | Accessibility summary |
| Lab good field poor | Lab rating good; field rating poor | CrUX comparison |
| Lab poor field good | Lab rating poor; field rating good | CrUX comparison |
| Matching ratings | Lab and field ratings match | CrUX comparison |
| Rating difference context | These sources measure different conditions. Check the collection period and URL or origin scope. | CrUX comparison |
| Matching rating context | Both sources use the same rating band for this metric. | CrUX comparison |
| Crawlability heading | Crawlability checks | SEO pack |
| Passing crawlability | URLs passing crawlability checks | SEO pack |
| Failing crawlability | URLs with crawlability failures | SEO pack |
| Unknown crawlability | URLs with unavailable crawlability checks | SEO pack |
| Crawlability scope | Based on Lighthouse is-crawlable, HTTP status, and robots.txt checks. | SEO pack |
| Insights grouping | Insights | Insights pack |
| Insight estimates | Estimated savings by metric | Insights pack |
| Insight time estimate | {metric}: {value} ms | Timing metric savings |
| Insight shift estimate | CLS: {value} | Dimensionless CLS savings |
| Insight totals disclosure | Totals add estimates across URLs. Estimates across metrics are not additive. | Insights pack |
| Source lab | Lighthouse lab results | Proven Lighthouse lab measurements |
| Source field | CrUX field data | Real-user measurements |
| Source mixed | Mixed measurement sources | Mixed-source summaries |
| Source unavailable | Measurement source unavailable | Measurements without proven source |
| Lab percentile scope | p75 across {count} measured URLs | Cross-URL performance summary |
| Lighthouse insight title | Use the producer's audit title unchanged | Insights and fixes |
| Field measurements | Field measurements | Proven field metric source |
| Empty performance metrics | No performance metrics captured | Missing performance measurements |
| Performance collection action | Run another scan to collect performance metrics. | Missing performance measurements |
| Unavailable | Unavailable | Missing measurements and checks |
| Performance trends scope | Performance metrics trends appear after two scans have field or lab data. | Site history |
| Performance sample context | Performance metrics can vary between parallel single-sample runs. Run with --samples 3 for stability. | Comparison settings |
| CSV report description | Per-route scores and performance metrics for spreadsheet tools. | Report downloads |
| Metric coverage | Measurements available for {analysed} of {eligible} entries | Performance metrics |
| Missing measurements | {missing} measurements unavailable | Performance metrics |
| Source details | Source details | Performance metrics |
| Missing collection period | Collection period unavailable | Field measurements |
| URL field data | URL field data | Field measurements for one URL |
| Origin field data | Origin field data | Field measurements for one origin |
| Performance middle band | Performance: Needs improvement | Scan progress |

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
