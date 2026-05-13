// query.* commands — read-only access to Storage for agent / dashboard use.
// `query.metrics` was folded into `query.routes` via a `projection` option.
// See v1.md §"Catalogue" line 805 + 809.

import { z } from 'zod'
import {
  Category,
  Device,
  MetricName,
  Paginated,
  ScanId,
  ScanRoute,
  Url,
} from '../types/atoms'
import { defineCommand } from './define'

// ── query.routes ────────────────────────────────────────────────────────────
export const QueryRoutes = defineCommand({
  name: 'query.routes',
  description:
    'Cross-scan route query. Optional `scanId` scopes to a single scan; `projection` returns metric-only views.',
  input: z.object({
    scanId: ScanId.optional(),
    site: Url.optional(),
    device: Device.optional(),
    branch: z.string().optional(),
    urlPattern: z.string().optional(),
    /** Limit columns returned. Empty / undefined returns the full row. */
    projection: z.array(MetricName).optional(),
    filter: z
      .object({
        minScore: z.partialRecord(Category, z.number()).optional(),
        maxMetric: z.partialRecord(MetricName, z.number()).optional(),
      })
      .optional(),
    sort: z
      .enum(['score-asc', 'score-desc', 'lcp-asc', 'lcp-desc', 'url-asc', 'capturedAt-desc'])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }),
  /**
   * When `projection` is set, only the named metric columns are populated;
   *  callers should treat the un-projected fields as `null`.
   */
  output: Paginated(ScanRoute),
})
