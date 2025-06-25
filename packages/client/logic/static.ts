import type { UnlighthouseRouteReport } from '@unlighthouse/core'
import { startCase } from 'lodash-es'
import { $URL, joinURL } from 'ufo'
import CellColorContrast from '../components/Cell/CellColorContrast.vue'
import CellImage from '../components/Cell/CellImage.vue'
import CellImageIssues from '../components/Cell/CellImageIssues.vue'
import CellIndexable from '../components/Cell/CellIndexable.vue'
import CellLargestContentfulPaint from '../components/Cell/CellLargestContentfulPaint.vue'
import CellLayoutShift from '../components/Cell/CellLayoutShift.vue'
import CellMetaDescription from '../components/Cell/CellMetaDescription.vue'
import CellNetworkRequests from '../components/Cell/CellNetworkRequests.vue'
import CellScreenshotThumbnails from '../components/Cell/CellScreenshotThumbnails.vue'
import CellTapTargets from '../components/Cell/CellTapTargets.vue'
import CellWebVitals from '../components/Cell/CellWebVitals.vue'
// Icon names for UIcon components
const MdiAccessibility = 'i-mdi-accessibility'
const MdiCellphone = 'i-mdi-cellphone'
const MdiSpeedometer = 'i-mdi-speedometer'
const MdiThumbUp = 'i-mdi-thumb-up'
const MdiViewDashboard = 'i-mdi-view-dashboard'
const MdiWeb = 'i-mdi-web'
const MdiWorld = 'i-mdi-world'

const {
  options: {
    site,
    client: {
      columns: configColumns,
      groupRoutesKey,
    },
    websocketUrl: wsUrl,
    apiUrl,
    lighthouseOptions,
    scanner: {
      dynamicSampling,
      throttle,
      device,
    },
    routerPrefix: basePath,
  },
} = window.__unlighthouse_payload

export const isStatic = window.__unlighthouse_static

export function resolveArtifactPath(report: UnlighthouseRouteReport, file: string) {
  if (!report?.artifactUrl) {
    return '' // Return empty string for missing artifact URLs
  }
  const withoutBase = report.artifactUrl.replace(basePath, '')

  if (isStatic) {
    // Clean up the pathname to remove trailing /index.html and similar artifacts
    let cleanPathname = window.location.pathname
    // Remove common static file names that shouldn't be part of the base path
    cleanPathname = cleanPathname.replace(/\/index\.html$/, '')

    return joinURL(cleanPathname, withoutBase, file)
  }

  return joinURL(window.location.pathname, withoutBase, file) // dynamic base
}

export { apiUrl, basePath, device, dynamicSampling, groupRoutesKey, lighthouseOptions, throttle, wsUrl }

export const website = new $URL(site).origin

export const categories = (lighthouseOptions?.onlyCategories || ['performance', 'accessibility', 'best-practices', 'seo'])
export const tabs = [
  'Overview',
  ...categories.map((c) => {
    if (c === 'seo')
      return 'SEO'

    return startCase(c)
  }),
  categories.includes('performance') ? 'CrUX' : undefined,
].filter(Boolean).map((tab) => {
  // map icons to tabs
  switch (tab) {
    case 'Overview':
      tab = { label: tab, icon: MdiViewDashboard }
      break
    case 'Performance':
      tab = { label: tab, icon: MdiSpeedometer }
      break
    case 'Accessibility':
      tab = { label: tab, icon: MdiAccessibility }
      break
    case 'Best Practices':
      tab = { label: tab, icon: MdiThumbUp }
      break
    case 'SEO':
      tab = { label: tab, icon: MdiWeb }
      break
    case 'PWA':
      tab = { label: tab, icon: MdiCellphone }
      break
    case 'CrUX':
      tab = { label: tab, icon: MdiWorld }
      break
  }
  return tab
})

// map the column components
export const columns = Object.values(configColumns)
  .map((columns) => {
    return columns.map((column) => {
      switch (column.key) {
        case 'report.audits.largest-contentful-paint':
          column.component = CellLargestContentfulPaint
          break
        case 'report.audits.cumulative-layout-shift':
          column.component = CellLayoutShift
          break
        case 'report.audits.network-requests':
          column.component = CellNetworkRequests
          break
        case 'report.audits.diagnostics':
          column.component = CellImageIssues
          break
        case 'report.audits.color-contrast':
          column.component = CellColorContrast
          break
        case 'seo.description':
          column.component = CellMetaDescription
          break
        case 'report.audits.is-crawlable':
          column.component = CellIndexable
          break
        case 'report.audits.screenshot-thumbnails':
          column.component = CellScreenshotThumbnails
          break
        case 'seo.og.image':
          column.component = CellImage
          break
        case 'report.audits.tap-targets':
          column.component = CellTapTargets
          break
      }
      switch (column.label) {
        case 'Core Web Vitals':
          column.component = CellWebVitals
          break
      }
      return column
    })
  })
