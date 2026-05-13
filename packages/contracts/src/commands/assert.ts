// assert.* commands — evaluate assertions against a completed scan.
// See v1.md §"lhci.md integration audit" lines 699 + 704.

import { z } from 'zod'
import { Assertion, AssertionResult, ScanId } from '../types/atoms'
import { defineCommand } from './define'

// ── assert.evaluate ─────────────────────────────────────────────────────────
export const AssertEvaluate = defineCommand({
  name: 'assert.evaluate',
  description: 'Evaluate one or more assertions against a completed scan.',
  input: z.object({
    scanId: ScanId,
    assertions: z.array(Assertion).min(1),
    /** Optional baseline scan for `maxRegression` assertions. */
    baselineScanId: ScanId.optional(),
  }),
  output: z.object({
    scanId: ScanId,
    passed: z.boolean(),
    results: z.array(AssertionResult),
  }),
  exitCodes: { ASSERTION_FAILED: 1, SCAN_NOT_FOUND: 64 },
})
