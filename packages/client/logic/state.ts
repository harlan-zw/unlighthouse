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
      cols: 2,
    },
    {
      label: 'Score',
      key: activeTab.value === 0 ? 'report.score' : `report.categories.${categories[activeTab.value - 1]}.score`,
      sortable: true,
      cols: activeTab.value === 0
          ? 3
          : 1,
      component: activeTab.value === 0
          ? CellScoresOverview
          : CellScoreSingle,
    },
    ...columns[activeTab.value],
    {
      label: 'Actions',
      cols: 1,
      slot: 'actions',
      classes: ['items-end justify-end'],
    },
  ]
})

export const wsReports: Map<string, UnlighthouseRouteReport> = reactive(new Map<string, UnlighthouseRouteReport>())

export const unlighthouseReports = computed<UnlighthouseRouteReport[]>(() => {
  return isStatic ? window.__unlighthouse_payload?.reports : Array.from(wsReports.values())
})

export const fetchedScanMeta = isStatic
    ? null
    : reactive(
        useFetch(`${apiUrl}/scan-meta`)
            .get()
            .json<ScanMeta>(),
    )

export const lastScanMeta = ref<ScanMeta|null>(null)

/**
 * Has the users session gone from online to offline
 */
export const isOffline = computed<boolean>(() => {
  if (isStatic)
    return true

  return !!(!fetchedScanMeta?.data && lastScanMeta.value)
})

export const rescanRoute = (route: NormalisedRoute) => useFetch(`${apiUrl}/reports/${route.id}/rescan`).post()

export const scanMeta = computed<ScanMeta|null>(() => {
  if (isStatic)
    return window.__unlighthouse_payload?.scanMeta

  if (fetchedScanMeta?.data)
    return fetchedScanMeta?.data

  // scan meta is null, check the last meta to avoid corrupting the UI
  if (lastScanMeta.value)
    return lastScanMeta.value

  return null
})

export function refreshScanMeta() {
  if (!fetchedScanMeta)
    return

  const res = fetchedScanMeta.execute()
  if (fetchedScanMeta?.data)
    lastScanMeta.value = fetchedScanMeta?.data

  return res
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
  const reportsFinished = unlighthouseReports.value.filter(r => !!r.report)
  return categories.map((c) => {
    const reportsWithGoodScore = reportsFinished
        // make sure the score is valid, if it's ? we don't want to count it
        .filter((r) => !!r.report?.categories?.[c].score)
    return sum(
        reportsWithGoodScore
            // make sure the score is valid, if it's ? we don't want to count it
            .map((r) => r.report?.categories?.[c].score)
    ) / reportsWithGoodScore.length
  })
})
