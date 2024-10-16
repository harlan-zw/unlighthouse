import type { NormalisedRoute, ScanMeta, UnlighthouseRouteReport } from '@unlighthouse/core'
import { sum } from 'lodash-es'
import { computed, reactive } from 'vue'
import CellRouteName from '../components/Cell/CellRouteName.vue'
import CellScoreSingle from '../components/Cell/CellScoreSingle.vue'
import CellScoresOverview from '../components/Cell/CellScoresOverview.vue'
import { useFetch } from './fetch'
import { sorting } from './search'
import { categories, columns, isStatic, wsUrl } from './static'

export const activeTab = ref(0)

export const isModalOpen = ref<boolean>(false)
export const iframeModalUrl = ref<string | null>()
export const isDebugModalOpen = ref<boolean>(false)

export function closeIframeModal() {
  isModalOpen.value = false
  iframeModalUrl.value = ''
  isDebugModalOpen.value = false
}
export function openDebugModal() {
  isModalOpen.value = true
  isDebugModalOpen.value = true
}
export function openLighthouseReportIframeModal(report: UnlighthouseRouteReport, tab?: string) {
  const path = `${report.artifactUrl}/lighthouse.html`
  iframeModalUrl.value = `${path}${tab ? `#${tab}` : ''}`
  isDebugModalOpen.value = false
  isModalOpen.value = true
}

export function changedTab(index: number) {
  activeTab.value = index
  sorting.value = {}
}

export const resultColumns = computed(() => {
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
      key: activeTab.value === 0 ? 'report.score' : `report.categories.${categories[activeTab.value - 1]}.score`,
      sortable: true,
      cols: activeTab.value === 0
        ? (categories.includes('performance') ? 3 : 5)
        : 1,
      component: activeTab.value === 0
        ? CellScoresOverview
        : CellScoreSingle,
    },
    ...(activeTab.value > columns.length - 1 ? [] : columns[activeTab.value])
      .filter((c) => {
        // remove screenshot timeline if performance is not present
        if (c.key === 'report.audits.screenshot-thumbnails' && !categories.includes('performance')) {
          return false
        }
        return true
      }),
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
    useFetch('/scan-meta')
      .get()
      .json<ScanMeta>(),
  )

export const lastScanMeta = ref<ScanMeta | null>(null)

/**
 * Has the users session gone from online to offline
 */
export const isOffline = computed<boolean>(() => {
  if (isStatic)
    return true

  return !!(!fetchedScanMeta?.data && lastScanMeta.value)
})

export const rescanRoute = (route: NormalisedRoute) => useFetch(`/reports/${route.id}/rescan`).post()

export const scanMeta = computed<ScanMeta | null>(() => {
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

export async function wsConnect() {
  const ws = new WebSocket(wsUrl)
  ws.onmessage = (message) => {
    const { response } = JSON.parse(message.data)
    wsReports.set(response.route.path, response)
  }
  const reports = await useFetch('/reports').get().json<UnlighthouseRouteReport[]>()
  reports.data.value?.forEach((report) => {
    wsReports.set(report.route.path, report)
  })
}

export const categoryScores = computed(() => {
  const reportsFinished = unlighthouseReports.value.filter(r => !!r.report)
  return categories.map((c, i) => {
    const reportsWithGoodScore = reportsFinished
    // make sure the score is valid, if it's ? we don't want to count it
      .filter(r => !!r.report?.categories?.[i].score)
    return sum(
      reportsWithGoodScore
      // make sure the score is valid, if it's ? we don't want to count it
        .map(r => r.report?.categories?.[i].score),
    ) / reportsWithGoodScore.length
  })
})
