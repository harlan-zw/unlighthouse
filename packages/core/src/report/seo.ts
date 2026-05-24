// @deprecated — dashboard aggregation tables removed. Use seo-basics pack.
import type { ProcessorParams, SeoSummary } from './types'

export async function processSeo(_params: ProcessorParams): Promise<SeoSummary> {
  return {
    pagesWithTitle: 0,
    pagesWithDescription: 0,
    pagesWithCanonical: 0,
    pagesIndexable: 0,
    duplicateTitles: 0,
    duplicateDescriptions: 0,
    missingOgTags: 0,
    missingStructuredData: 0,
    genericLinkTextCount: 0,
  }
}
