import type { ProcessorParams, SeoSummary } from './types'
import { canonicalChains, linkTextIssues, seoDuplicates, seoMeta, tapTargetIssues } from '../data/history/schema'

interface SeoMetaRecord {
  scanId: string
  path: string
  title?: string | null
  titleLength?: number | null
  metaDescription?: string | null
  metaDescriptionLength?: number | null
  isIndexable: boolean
  robotsDirective?: string | null
  canonical?: string | null
  canonicalType: string
  ogTitle?: string | null
  ogDescription?: string | null
  ogImage?: string | null
  ogUrl?: string | null
  twitterCard?: string | null
  twitterTitle?: string | null
  twitterDescription?: string | null
  twitterImage?: string | null
  hasStructuredData: boolean
  structuredDataTypes?: string | null
  hreflangTags?: string | null
}

function getCanonicalType(path: string, canonical: string | null | undefined): string {
  if (!canonical)
    return 'missing'
  if (canonical === path || canonical.endsWith(path))
    return 'self'
  return 'other'
}

interface ChainResult {
  pages: string[]
  target: string
  isLoop: boolean
}

function findCanonicalChains(map: Map<string, string>): ChainResult[] {
  const chains: ChainResult[] = []
  const visited = new Set<string>()

  for (const [start] of map) {
    if (visited.has(start))
      continue

    const chain = [start]
    let current = start
    let foundLoop = false

    while (map.has(current)) {
      const next = map.get(current)!
      if (chain.includes(next)) {
        chains.push({ pages: chain, target: next, isLoop: true })
        foundLoop = true
        break
      }
      chain.push(next)
      current = next
    }

    if (!foundLoop && chain.length > 2) {
      chains.push({ pages: chain.slice(0, -1), target: chain.at(-1)!, isLoop: false })
    }

    chain.forEach(p => visited.add(p))
  }

  return chains
}

export async function processSeo(p: ProcessorParams): Promise<SeoSummary> {
  const { db, scanId, routes, htmlData } = p

  // 1. Store per-page SEO meta
  const seoMetaRecords: SeoMetaRecord[] = [...routes.entries()].map(([path, route]) => {
    const html = htmlData?.get(path)
    return {
      scanId,
      path,
      title: html?.title,
      titleLength: html?.title?.length ?? null,
      metaDescription: html?.metaDescription,
      metaDescriptionLength: html?.metaDescription?.length ?? null,
      isIndexable: route.audits['is-crawlable']?.score === 1,
      robotsDirective: html?.robots,
      canonical: html?.canonical,
      canonicalType: getCanonicalType(path, html?.canonical),
      ogTitle: html?.og?.title,
      ogDescription: html?.og?.description,
      ogImage: html?.og?.image,
      ogUrl: html?.og?.url,
      twitterCard: html?.twitter?.card,
      twitterTitle: html?.twitter?.title,
      twitterDescription: html?.twitter?.description,
      twitterImage: html?.twitter?.image,
      hasStructuredData: (html?.jsonLd?.length ?? 0) > 0,
      structuredDataTypes: JSON.stringify(html?.jsonLd?.map((j: any) => j['@type']) ?? []),
      hreflangTags: JSON.stringify(html?.hreflang ?? []),
    }
  })

  if (seoMetaRecords.length > 0) {
    db.insert(seoMeta).values(seoMetaRecords).run()
  }

  // 2. Find duplicates
  const titleMap = new Map<string, string[]>()
  const descMap = new Map<string, string[]>()

  for (const meta of seoMetaRecords) {
    if (meta.title) {
      const pages = titleMap.get(meta.title) ?? []
      pages.push(meta.path)
      titleMap.set(meta.title, pages)
    }
    if (meta.metaDescription) {
      const pages = descMap.get(meta.metaDescription) ?? []
      pages.push(meta.path)
      descMap.set(meta.metaDescription, pages)
    }
  }

  const duplicates = [
    ...[...titleMap.entries()]
      .filter(([_, pages]) => pages.length > 1)
      .map(([value, pages]) => ({
        scanId,
        type: 'title',
        value,
        pageCount: pages.length,
        pages: JSON.stringify(pages),
      })),
    ...[...descMap.entries()]
      .filter(([_, pages]) => pages.length > 1)
      .map(([value, pages]) => ({
        scanId,
        type: 'meta_description',
        value,
        pageCount: pages.length,
        pages: JSON.stringify(pages),
      })),
  ]

  if (duplicates.length > 0) {
    db.insert(seoDuplicates).values(duplicates).run()
  }

  // 3. Detect canonical chains
  const canonicalMap = new Map<string, string>()
  for (const meta of seoMetaRecords) {
    if (meta.canonical && meta.canonical !== meta.path) {
      canonicalMap.set(meta.path, meta.canonical)
    }
  }

  const chains = findCanonicalChains(canonicalMap)
  const chainValues = chains.map(chain => ({
    scanId,
    chainType: chain.isLoop ? 'loop' : 'chain',
    pages: JSON.stringify(chain.pages),
    finalTarget: chain.target,
  }))

  if (chainValues.length > 0) {
    db.insert(canonicalChains).values(chainValues).run()
  }

  // 4. Generic link text
  const linkTextMap = new Map<string, { text: string, count: number, pages: Set<string> }>()
  const genericTexts = ['click here', 'read more', 'learn more', 'here', 'more', 'link']

  for (const [path, route] of routes) {
    const items = route.audits['link-text']?.details?.items ?? []
    for (const item of items) {
      const text = (item.text ?? '').toLowerCase().trim()
      if (!genericTexts.includes(text))
        continue
      const existing = linkTextMap.get(text) ?? { text: item.text ?? text, count: 0, pages: new Set() }
      existing.count++
      existing.pages.add(path)
      linkTextMap.set(text, existing)
    }
  }

  const linkTextValues = [...linkTextMap.values()].map(lt => ({
    scanId,
    text: lt.text,
    instanceCount: lt.count,
    pageCount: lt.pages.size,
    pages: JSON.stringify([...lt.pages]),
  }))

  if (linkTextValues.length > 0) {
    db.insert(linkTextIssues).values(linkTextValues).run()
  }

  // 5. Tap target issues
  const tapTargets: { path: string, elementCount: number, elements: any[] }[] = []

  for (const [path, route] of routes) {
    const items = route.audits['tap-targets']?.details?.items ?? []
    if (items.length > 0) {
      tapTargets.push({
        path,
        elementCount: items.length,
        elements: items,
      })
    }
  }

  const tapTargetValues = tapTargets.map(tt => ({
    scanId,
    path: tt.path,
    elementCount: tt.elementCount,
    elements: JSON.stringify(tt.elements),
  }))

  if (tapTargetValues.length > 0) {
    db.insert(tapTargetIssues).values(tapTargetValues).run()
  }

  return computeSeoSummary(seoMetaRecords, duplicates, chains)
}

function computeSeoSummary(records: SeoMetaRecord[], duplicates: any[], chains: ChainResult[]): SeoSummary {
  const pagesWithTitle = records.filter(r => r.title).length
  const pagesWithDescription = records.filter(r => r.metaDescription).length
  const pagesWithCanonical = records.filter(r => r.canonical).length
  const pagesIndexable = records.filter(r => r.isIndexable).length

  const duplicateTitles = duplicates.filter(d => d.type === 'title').length
  const duplicateDescriptions = duplicates.filter(d => d.type === 'meta_description').length

  const missingOgTags = records.filter(r => !r.ogTitle && !r.ogDescription).length
  const missingStructuredData = records.filter(r => !r.hasStructuredData).length

  return {
    pagesWithTitle,
    pagesWithDescription,
    pagesWithCanonical,
    pagesIndexable,
    duplicateTitles,
    duplicateDescriptions,
    missingOgTags,
    missingStructuredData,
    genericLinkTextCount: 0, // computed from linkTextIssues
  }
}
