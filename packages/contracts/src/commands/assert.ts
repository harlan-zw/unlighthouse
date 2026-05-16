// assert.* commands — evaluate assertions against a completed scan.
// See v1.md §"lhci.md integration audit" lines 699 + 704.

import { z } from 'zod'
import { AssertionResultSchema, AssertionSchema, ScanIdSchema } from '../types/atoms'
import { defineCommand } from './define'

// ── assert.evaluate ─────────────────────────────────────────────────────────
export const AssertEvaluate = defineCommand({
  name: 'assert.evaluate',
  description: 'Evaluate one or more assertions against a completed scan.',
  input: z.object({
    scanId: ScanIdSchema,
    assertions: z.array(AssertionSchema).min(1),
    /** Optional baseline scan for `maxRegression` assertions. */
    baselineScanId: ScanIdSchema.optional(),
  }),
  output: z.object({
    scanId: ScanIdSchema,
    passed: z.boolean(),
    results: z.array(AssertionResultSchema),
  }),
  exitCodes: { ASSERTION_FAILED: 1, SCAN_NOT_FOUND: 64 },
})
