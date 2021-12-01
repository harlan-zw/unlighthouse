import { useFetch } from '@vueuse/core'
import { computed, reactive } from 'vue'
import {NormalisedRoute, StatsResponse, UnlighthouseRouteReport} from 'unlighthouse-utils'
import { $fetch } from 'ohmyfetch'
import CellRouteName from "../components/Cell/CellRouteName.vue";
import CellScoresOverview from "../components/Cell/CellScoresOverview.vue";
import CellScoreSingle from "../components/Cell/CellScoreSingle.vue";
import {columns, apiUrl, wsUrl, categories} from "./static";
import sum from "lodash/sum";
import {sorting} from "./search";

export const activeTab = ref(0)

export const isModalOpen = ref<boolean>(false)
export const iframeModelUrl = ref<string|null>()

export const closeIframeModal = () => {
  isModalOpen.value = false
  iframeModelUrl.value = ''
}
export const openLighthouseReportIframeModal = (report: UnlighthouseRouteReport, tab?: string) => {
  iframeModelUrl.value = `${apiUrl}/reports/${report.reportId}/lighthouse${tab ? '#' + tab : ''}`
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
      }
    },
    {
      label: 'Score',
      key: activeTab.value === 0 ? 'report.score' : `report.categories.${categories[activeTab.value - 1]}.score`,
      sortable: true,
      cols: activeTab.value === 0 ? {
        xs: 7,
        'lg': 4,
        xl: 3,
      } : {
        xs: 2,
        xl: 1,
      },
      component: activeTab.value === 0 ?
          CellScoresOverview :
          CellScoreSingle
    },
    ...columns[activeTab.value],
    { label: 'Actions', cols: {
        xs: 1,
      }, slot: 'actions', classes: ['items-end justify-end'] }
  ]
})

export const wsReports: Map<string, UnlighthouseRouteReport> = reactive(new Map<string, UnlighthouseRouteReport>())

export const fetchedStats = reactive(
    useFetch(`${apiUrl}/stats`)
        .get()
        .json<StatsResponse>(),
)

export const rescanRoute = (route: NormalisedRoute) => useFetch(`${apiUrl}/reports/${route.id}/rescan`).post()

export const stats = computed<StatsResponse>(() => fetchedStats.data)

export function refetchStats() {
  return fetchedStats.execute()
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
  const reportsFinished = [...wsReports.values()].filter(r => !!r.report)
  return categories.map(c => {
    return sum(reportsFinished.map(r => {
      return r.report?.categories?.[c].score
    })) / reportsFinished.length
  })
})
