import { useFetch } from '@vueuse/core'
import { computed, reactive } from 'vue'
import type { NormalisedRoute, ScanMeta, UnlighthouseRouteReport } from '@unlighthouse/core'
import { $fetch } from 'ohmyfetch'
import { sum } from 'lodash-es'
import CellRouteName from '../components/Cell/CellRouteName.vue'
import CellScoresOverview from '../components/Cell/CellScoresOverview.vue'
import CellScoreSingle from '../components/Cell/CellScoreSingle.vue'
import { apiUrl, categories, columns, isStatic, wsUrl } from './static'
import { sorting } from './search'

export const activeTab = ref(0)

export const isModalOpen = ref<boolean>(false)
export const iframeModelUrl = ref<string|null>()

export const closeIframeModal = () => {
  isModalOpen.value = false
  iframeModelUrl.value = ''
}
export const openLighthouseReportIframeModal = (report: UnlighthouseRouteReport, tab?: string) => {
  if (isStatic) {
    const path = report.reportHtml.substring(report.reportHtml.indexOf('/routes/'))
    iframeModelUrl.value = `${path}${tab ? `#${tab}` : ''}`
  }
  else {
    iframeModelUrl.value = `${apiUrl}/reports/${report.reportId}/lighthouse${tab ? `#${tab}` : ''}`
  }
  isModalOpen.value = true
}
export const openFullScreenshotIframeModal = (report: UnlighthouseRouteReport) => {
  iframeModelUrl.value = `${apiUrl}/reports/${report.reportId}/full-page-screenshot`
  isModalOpen.value = true
}

export const changedTab = (index: number) => {
  activeTab.value = index
  sorting.value = {}
}

export const resultColumns = computed(() => {
  return [
    {
      label: 'Route Name',
      slot: 'routeName',
      key: 'route.path',
      sortable: true,
      component: CellRouteName,
      cols: {
        xs: 4,
        lg: 3,
        xl: 2,
      },
    },
    {
      label: 'Score',
      key: activeTab.value === 0 ? 'report.score' : `report.categories.${categories[activeTab.value - 1]}.score`,
      sortable: true,
      cols: activeTab.value === 0
        ? {
          xs: 7,
          lg: 4,
          xl: 3,
        }
        : {
          xs: 2,
          xl: 1,
        },
      component: activeTab.value === 0
        ? CellScoresOverview
        : CellScoreSingle,
    },
    ...columns[activeTab.value],
    {
      label: 'Actions',
      cols: {
        xs: 1,
      },
      slot: 'actions',
      classes: ['items-end justify-end'],
    },
  ]
})

export const wsReports: Map<string, UnlighthouseRouteReport> = reactive(new Map<string, UnlighthouseRouteReport>())

export const fetchedScanMeta = isStatic
  ? null
  : reactive(
    useFetch(`${apiUrl}/scan-meta`)
      .get()
      .json<ScanMeta>(),
  )

export const rescanRoute = (route: NormalisedRoute) => useFetch(`${apiUrl}/reports/${route.id}/rescan`).post()

export const scanMeta = computed<ScanMeta|null>(() => {
  if (isStatic)
    return window.__unlighthouse_data?.scanMeta

  return fetchedScanMeta?.data || null
})

export function refreshScanMeta() {
  if (!fetchedScanMeta)
    return

  return fetchedScanMeta.execute()
}

export const wsConnect = async() => {
  const ws = new WebSocket(wsUrl)
  ws.onmessage = (message) => {
    const { response } = JSON.parse(message.data)
    wsReports.set(response.route.path, response)
  }
  const reports = await $fetch<UnlighthouseRouteReport[]>(`${apiUrl}/reports`)
  reports.forEach((report) => {
    wsReports.set(report.route.path, report)
  })
}

export const categoryScores = computed(() => {
  const data = isStatic && window.__unlighthouse_data ? window.__unlighthouse_data.reports : [...wsReports.values()]
  const reportsFinished = data.filter(r => !!r.report)
  return categories.map((c) => {
    return sum(reportsFinished.map((r) => {
      return r.report?.categories?.[c].score
    })) / reportsFinished.length
  })
})
