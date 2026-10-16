# Export

`unlighthouse export <scan>` writes the static report (an HTML folder that opens without a server). `--format csv` writes two CSV files instead:

```sh
unlighthouse export <scanId> --format csv --out unlighthouse-csv          # unlighthouse-csv/pages.csv, unlighthouse-csv/issues.csv
unlighthouse export <scanId> --format csv --out unlighthouse-csv --bom    # with a UTF-8 byte order mark, for Excel
```

The running server serves the same files to an authenticated client (token as for the API: `Authorization: Bearer <token>` or the session cookie):

```
GET /export/<scanId>/pages.csv
GET /export/<scanId>/issues.csv
GET /export/<scanId>/pages.csv?bom=1
```

## Format

- RFC 4180: comma separated, CRLF line ends, a header row, fields that contain `"`, `,`, CR or LF are wrapped in `"` with `"` doubled. UTF-8, without a byte order mark unless `--bom` / `?bom=1`.
- Empty cell = not measured (`null`).
- Text cells that start with `=`, `+`, `-`, `@`, tab or CR get a leading `'`, so spreadsheets do not run them as formulas. Numeric cells are written as plain numbers and never prefixed.
- Columns are only ever added at the end of a file; read them by name.

## pages.csv

One row per page × device, every status (`queued`, `running`, `done`, `failed`, `skipped`), ordered by URL then device.

| Column | Type | Meaning |
|---|---|---|
| `url` | text | Page URL as audited |
| `template` | text | URL template the page belongs to, e.g. `/blog/*` |
| `device` | `mobile` \| `desktop` | Lighthouse form factor |
| `status` | text | `done`, `failed`, `skipped`, `queued` or `running` |
| `score_performance` | 0–1 | Lighthouse category score |
| `score_accessibility` | 0–1 | |
| `score_best_practices` | 0–1 | |
| `score_seo` | 0–1 | |
| `score_agentic_browsing` | 0–1 | |
| `metric_fcp` | ms | First Contentful Paint (lab) |
| `metric_lcp` | ms | Largest Contentful Paint (lab) |
| `metric_tbt` | ms | Total Blocking Time (lab) |
| `metric_cls` | unitless | Cumulative Layout Shift (lab) |
| `metric_si` | ms | Speed Index (lab) |
| `metric_ttfb` | ms | Time to First Byte (lab) |
| `error` | text | Why the audit failed or the page was skipped; empty otherwise |

## issues.csv

One row per site-wide issue (one failing audit, merged across pages and the items it names), ranked by impact, highest first.

| Column | Type | Meaning |
|---|---|---|
| `audit_id` | text | Lighthouse audit id, e.g. `image-delivery-insight` |
| `title` | text | Audit title |
| `category` | text | Lighthouse category, empty when the audit belongs to none |
| `severity` | `fail` \| `warn` | |
| `pages` | integer | Number of distinct URLs affected |
| `items` | integer | Number of distinct items the audit names (resource URL, selector); 0 for page-level audits |
| `top_item` | text | Key of the item with the largest savings; empty for page-level audits |
| `devices` | text | Affected devices, space separated |
| `templates` | text | Affected templates, space separated |
| `savings_ms` | ms | Estimated time savings: the largest item saving of each affected page, summed over pages |
| `savings_bytes` | bytes | Estimated transfer savings: the largest item saving of each affected page, summed over pages |
| `impact` | number | Ranking score: affected pages weighted by severity plus savings |
