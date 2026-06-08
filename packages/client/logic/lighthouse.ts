/**
 * Resolve the Largest Contentful Paint element rows from the `largest-contentful-paint-element` audit.
 *
 * Lighthouse omits `details` entirely when no LCP element is detected (it returns
 * `{ score: null, notApplicable: true }` for blank, errored or non-contentful pages). The happy path
 * is a nested `list` detail whose first table holds the element rows. Resolving defensively means a
 * missing LCP element no longer throws while rendering, which previously blanked the whole column. (#375)
 */
export function lcpElementItems(audit: any): any[] {
  return audit?.details?.items?.[0]?.items ?? []
}
