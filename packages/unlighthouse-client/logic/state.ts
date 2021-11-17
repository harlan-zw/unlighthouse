import { useFetch } from '@vueuse/core'
import { computed, reactive } from 'vue'
import {NormalisedRoute, StatsResponse, UnlighthouseRouteReport} from '@shared'
import { $fetch } from 'ohmyfetch'
import CellRouteName from "../components/Cell/CellRouteName.vue";
import CellScoresOverview from "../components/Cell/CellScoresOverview.vue";
import CellScoreSingle from "../components/Cell/CellScoreSingle.vue";
import {columns, apiUrl, wsUrl, hasDefinitions} from "./static";

export const activeTab = ref(0)

export const changedTab = (index: number) => {
  activeTab.value = index
}

export const resultColumns = computed(() => {
  const showRouteDefinitions = activeTab.value === 0 && hasDefinitions
  return [
    {
      label: 'Route Name',
      slot: 'routeName',
      key: 'route.path',
      sortable: true,
      component: CellRouteName
    },
    {
      label: 'Score',
      key: 'report.score',
      cols: activeTab.value === 0 ? 3 : 1,
      sortable: true,
      component: activeTab.value === 0 ?
          CellScoresOverview :
          CellScoreSingle
    },
      // dynamically add the component column if we have route definitions
    ...(showRouteDefinitions ?
        [ { label: 'Component', cols: 1, key: 'route.definition.componentBaseName', sortable: true }] :
        []),
    ...columns[activeTab.value],
    { label: 'Actions', cols: 1, slot: 'actions', classes: ['items-end justify-end'] }
  ]
})

export const wsReports: Map<string, UnlighthouseRouteReport> = reactive(new Map<string, UnlighthouseRouteReport>())

export const fetchedStats = reactive(
    useFetch(`${apiUrl}/stats`)
        .get()
        .json<StatsResponse>(),
)

export const rescanAll = () => useFetch(`${apiUrl}/reports/rescan`).post()
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
