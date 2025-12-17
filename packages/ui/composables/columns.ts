import type { UnlighthouseColumn } from '@unlighthouse/core'
import CellColorContrast from '~/components/Cell/CellColorContrast.vue'
import CellImage from '~/components/Cell/CellImage.vue'
import CellImageIssues from '~/components/Cell/CellImageIssues.vue'
import CellIndexable from '~/components/Cell/CellIndexable.vue'
import CellLargestContentfulPaint from '~/components/Cell/CellLargestContentfulPaint.vue'
import CellLayoutShift from '~/components/Cell/CellLayoutShift.vue'
import CellMetaDescription from '~/components/Cell/CellMetaDescription.vue'
import CellNetworkRequests from '~/components/Cell/CellNetworkRequests.vue'
import CellRouteName from '~/components/Cell/CellRouteName.vue'
import CellScoresOverview from '~/components/Cell/CellScoresOverview.vue'
import CellScoreSingle from '~/components/Cell/CellScoreSingle.vue'
import CellScreenshotThumbnails from '~/components/Cell/CellScreenshotThumbnails.vue'
import CellTapTargets from '~/components/Cell/CellTapTargets.vue'
import CellWebVitals from '~/components/Cell/CellWebVitals.vue'
import { categories, configColumns } from './unlighthouse'
import { activeTab } from './state'
import { columns } from './search'

const COLUMN_COMPONENTS: Record<string, any> = {
  'report.audits.largest-contentful-paint': CellLargestContentfulPaint,
  'report.audits.cumulative-layout-shift': CellLayoutShift,
  'report.audits.network-requests': CellNetworkRequests,
  'report.audits.diagnostics': CellImageIssues,
  'report.audits.color-contrast': CellColorContrast,
  'seo.description': CellMetaDescription,
  'report.audits.is-crawlable': CellIndexable,
  'report.audits.screenshot-thumbnails': CellScreenshotThumbnails,
  'seo.og.image': CellImage,
  'report.audits.tap-targets': CellTapTargets,
}

const LABEL_COMPONENTS: Record<string, any> = {
  'Core Web Vitals': CellWebVitals,
}

export const mappedColumns = computed(() => {
  const cols = configColumns.value
  return Object.values(cols).map((colGroup) => {
    return (colGroup as UnlighthouseColumn[]).map((column) => {
      const component = COLUMN_COMPONENTS[column.key || ''] || LABEL_COMPONENTS[column.label || '']
      return component ? { ...column, component } : column
    })
  })
})

interface ResultColumn extends UnlighthouseColumn {
  component?: any
  slot?: string
}

export const resultColumns = computed((): ResultColumn[] => {
  const tab = activeTab.value
  const cats = categories.value

  return [
    {
      label: 'Page',
      slot: 'routeName',
      key: 'route.path',
      sortable: true,
      component: CellRouteName,
      cols: 2,
    },
    {
      label: 'Score',
      key: tab === 0 ? 'report.score' : `report.categories.${cats[tab - 1]}.score`,
      sortable: true,
      cols: tab === 0 ? (cats.includes('performance') ? 3 : 5) : 1,
      component: tab === 0 ? CellScoresOverview : CellScoreSingle,
    },
    ...(tab > mappedColumns.value.length - 1 ? [] : mappedColumns.value[tab] || [])
      .filter((c) => {
        if (c.key === 'report.audits.screenshot-thumbnails' && !cats.includes('performance')) {
          return false
        }
        return true
      }),
    {
      label: 'Actions',
      cols: 1,
      slot: 'actions',
      classes: ['justify-center'],
    },
  ]
})
