// D-041: category-split distribution. A third composer alongside `routeAuditors`
// / `fallbackAuditor` that fans each Lighthouse category to its own backend and
// merges the results. Unlike general `mergeAuditors` (deferred, D-019b), a
// disjoint-category merge has no conflicts: each category's audits come from
// exactly one backend, so "merge" is concatenation plus per-category provenance.
//
// Example: { performance: local, accessibility: psi, seo: psi } gives a fast
// parallel a11y/seo sweep with a trustworthy local perf score in one scan.

import type { AuditOpts, Auditor, AuditorCapabilities, AuditorReport, Category, NamedAuditor, Page } from '@unlighthouse/contracts/ports'
import { ErrorCodes, UnlighthouseError } from '@unlighthouse/contracts/errors'
import { CategorySchema } from '@unlighthouse/contracts/types/atoms'
import { attachExtractedRouteData } from '../lighthouse-report'

export type CategoryAssignments = Partial<Record<Category, NamedAuditor>>

export interface SplitCategoriesOptions {
  assignments: CategoryAssignments
}

function assignedCategories(assignments: CategoryAssignments): Category[] {
  return CategorySchema.array().parse(Object.keys(assignments))
}

function assignedEntries(assignments: CategoryAssignments): Array<[Category, NamedAuditor]> {
  return assignedCategories(assignments).flatMap((category) => {
    const assignee = assignments[category]
    return assignee ? [[category, assignee]] : []
  })
}

/** Validate at construction: non-empty, and each backend supports its assigned category. */
function validate(assignments: CategoryAssignments): void {
  const categories = assignedCategories(assignments)
  if (categories.length === 0) {
    throw new UnlighthouseError({
      code: ErrorCodes.CONFIG_INVALID,
      message: 'splitCategoriesAuditor: assignments must cover at least one category.',
    })
  }
  for (const [category, assignee] of assignedEntries(assignments)) {
    if (!assignee.auditor.capabilities.categories.includes(category)) {
      throw new UnlighthouseError({
        code: ErrorCodes.CONFIG_INVALID,
        message: `splitCategoriesAuditor: auditor "${assignee.name}" assigned to "${category}" does not support that category (supports: ${assignee.auditor.capabilities.categories.join(', ')}).`,
      })
    }
  }
}

/**
 * Capabilities derive per category: `reliablePerfScores` / `supportsThrottling`
 * come from the perf assignee only (which fixes the AND-collapse coarseness of
 * `routeAuditors` for this composer); `reliableFieldData` is true if any
 * assignee provides it; `categories` is the assigned set.
 */
function deriveCapabilities(assignments: CategoryAssignments): AuditorCapabilities {
  const perf = assignments.performance?.auditor.capabilities
  const all = assignedEntries(assignments).map(([, assignee]) => assignee.auditor.capabilities)
  return {
    reliablePerfScores: perf?.reliablePerfScores ?? false,
    supportsThrottling: perf?.supportsThrottling ?? false,
    reliableFieldData: all.some(c => c.reliableFieldData),
    categories: assignedCategories(assignments),
  }
}

export function splitCategoriesAuditor(opts: SplitCategoriesOptions): Auditor {
  const { assignments } = opts
  validate(assignments)
  const capabilities = deriveCapabilities(assignments)

  return {
    capabilities,
    async audit(url: string, page?: Page, auditOpts?: AuditOpts): Promise<AuditorReport> {
      // Group assigned categories by their (distinct) backend so a backend that
      // owns several categories runs once with all of them scoped in.
      const byBackend = new Map<NamedAuditor, Category[]>()
      for (const [category, assignee] of assignedEntries(assignments)) {
        const list = byBackend.get(assignee) ?? []
        list.push(category)
        byBackend.set(assignee, list)
      }

      // Run each backend once, scoped to its categories via onlyCategories.
      const results: Array<{ backend: NamedAuditor, categories: Category[], report: AuditorReport }> = []
      for (const [backend, categories] of byBackend) {
        const scopedOpts: AuditOpts = {
          ...auditOpts,
          lighthouseFlags: { ...auditOpts?.lighthouseFlags, onlyCategories: categories },
        }
        const report = await backend.auditor.audit(url, page, scopedOpts)
        results.push({ backend, categories, report })
      }

      // Base metadata from the perf assignee's run (or the first) — LH version,
      // environment, timing all live on the raw LHR.
      const perfBackend = assignments.performance
      const firstResult = results[0]
      if (!firstResult)
        throw new TypeError('Expected at least one category auditor result.')
      const base = (perfBackend && results.find(r => r.backend === perfBackend)?.report) ?? firstResult.report

      // Concatenate: each backend contributes its assigned categories; audits are
      // unioned (disjoint per category, so no conflict).
      const mergedCategories: AuditorReport['categories'] = {}
      const mergedAudits: AuditorReport['audits'] = {}
      const perCategoryAuditor: Record<string, string> = {}
      for (const { backend, categories, report } of results) {
        Object.assign(mergedAudits, report.audits ?? {})
        for (const category of categories) {
          if (report.categories?.[category] !== undefined)
            mergedCategories[category] = report.categories[category]
          perCategoryAuditor[category] = backend.name
        }
      }

      const mergedLhr: AuditorReport = {
        ...base,
        lighthouseVersion: base.lighthouseVersion,
        categories: mergedCategories,
        audits: mergedAudits,
      }

      // A single distinct backend collapses to that backend's name; diverging
      // categories record `split` at the row level (per-category truth lives in
      // the reconciled report's `provenance.auditors`).
      const distinct = new Set(Object.values(perCategoryAuditor))
      const onlyAuditor = distinct.values().next().value
      const rowAuditor = distinct.size === 1 && onlyAuditor ? onlyAuditor : 'split'

      const out = attachExtractedRouteData(mergedLhr, url, rowAuditor)
      out.auditor = rowAuditor
      out.auditors = perCategoryAuditor
      return out
    },
  }
}
