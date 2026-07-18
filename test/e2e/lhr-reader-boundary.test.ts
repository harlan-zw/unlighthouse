// D-034: LH-version isolation boundary. Reading a stored raw LHR blob (via
// `lhrBlobKey`) is confined to the report-translation layer + the labelled raw
// escape hatches (dashboard screenshot fallback / raw-LHR export, static build
// screenshot fallback, on-demand pack getLhr). Every other consumer reads the
// reconciled report instead, so a Lighthouse version bump can't ripple past the
// translation layer. This test fails if a new reader gunzips raw LHR.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = [
  resolve(ROOT, 'packages/core/src'),
  resolve(ROOT, 'packages/unlighthouse/src'),
]

// Files permitted to read a raw LHR blob keyed by `lhrBlobKey`.
const ALLOWLIST = new Set([
  // Translation layer + the reusable ingest/finalize that writes the reconciled shape.
  'packages/core/src/report/extract.ts',
  'packages/core/src/scan/route-audit.ts',
  // On-demand pack access (PackReconcileCtx.getLhr).
  'packages/core/src/packs/reconcile-context.ts',
  // Labelled raw escape hatches.
  'packages/core/src/api/dashboard.ts',
  'packages/unlighthouse/src/build.ts',
])

// `storage.blobs.get(<expr containing lhrBlobKey>)` — a raw LHR blob read.
const RAW_LHR_READ = /blobs\s*\.\s*get\s*\([^)]*lhrBlobKey/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory())
      out.push(...walk(full))
    else if (full.endsWith('.ts'))
      out.push(full)
  }
  return out
}

describe('D-034 raw-LHR reader boundary', () => {
  it('only the translation layer + labelled escape hatches read raw LHR blobs', () => {
    const offenders: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const file of walk(dir)) {
        if (RAW_LHR_READ.test(readFileSync(file, 'utf8'))) {
          const rel = relative(ROOT, file)
          if (!ALLOWLIST.has(rel))
            offenders.push(rel)
        }
      }
    }
    expect(offenders, `raw-LHR readers outside the allowed boundary: ${offenders.join(', ')}`).toEqual([])
  })
})
