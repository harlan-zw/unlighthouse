import {createEventHook, useFetch} from '@vueuse/core'
import {computed, reactive} from 'vue'
import {RouteReport} from '../../types'
import { $fetch } from 'ohmyfetch'

export const onRefetchStats = createEventHook<void>()
export const wsReports: Map<string, RouteReport> = reactive(new Map<string, RouteReport>())

export const fetchedStats = reactive(
  useFetch('http://localhost:3000/api/stats')
    .get()
    .json<{ stats: {} }>(),
)

export const refetch = (route : RouteReport) => useFetch('http://localhost:3000/api/reports/' + route.id + '/rescan').post()

export const stats = computed(() => fetchedStats.data || false)

export function refetchStats() {
  onRefetchStats.trigger()
  return fetchedStats.execute()
}

const wsConnect = async() => {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const wsPath = '/api/ws'
  const wsURL = `${protocol}://${location.hostname}:${location.port}${wsPath}`
  const ws = new WebSocket(wsURL)
  ws.onopen = () => {
    console.info('WS connected')
  }
  ws.onmessage = (message) => {
    console.info('WS message', message)
    const { response } = JSON.parse(message.data)
    wsReports.set(response.route.path, response)
    console.info(response)
  }
  ws.onerror = (error) => {
    console.info('WS error', error)
  }
  ws.onclose = () => {
    console.info('WS closed')
  }
  const reports = await $fetch<RouteReport[]>('http://localhost:3000/api/reports')
  console.log(reports.length)
  reports.forEach(report => {
    console.log(report.route.path)
    wsReports.set(report.route.path, report)
  })
}
wsConnect()
