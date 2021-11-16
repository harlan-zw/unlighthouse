import { useFetch } from '@vueuse/core'
import { computed, reactive } from 'vue'
import {NormalisedRoute, StatsResponse, UnlighthouseRouteReport, UnlighthouseWorkerStats} from '@shared'
import { $fetch } from 'ohmyfetch'

export const wsReports: Map<string, UnlighthouseRouteReport> = reactive(new Map<string, UnlighthouseRouteReport>())

export const fetchedStats = reactive(
  useFetch('http://localhost:3000/api/stats')
    .get()
    .json<StatsResponse>(),
)

export const rescanAll = () => useFetch(`http://localhost:3000/api/reports/rescan`).post()
export const rescanRoute = (route: NormalisedRoute) => useFetch(`http://localhost:3000/api/reports/${route.id}/rescan`).post()

export const stats = computed<StatsResponse>(() => fetchedStats.data)

export function refetchStats() {
  return fetchedStats.execute()
}

export const wsConnect = async() => {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const wsPath = '/api/ws'
  const wsURL = `${protocol}://${location.hostname}:${location.port}${wsPath}`
  const ws = new WebSocket(wsURL)
  ws.onmessage = (message) => {
    const { response } = JSON.parse(message.data)
    wsReports.set(response.route.path, response)
  }
  const reports = await $fetch<UnlighthouseRouteReport[]>('http://localhost:3000/api/reports')
  reports.forEach((report) => {
    wsReports.set(report.route.path, report)
  })
}
