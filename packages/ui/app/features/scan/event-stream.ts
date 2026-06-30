import type { ScanId } from '@unlighthouse/contracts'
import type { Ref } from 'vue'
import { computed, onUnmounted, ref } from 'vue'

export interface StreamEvent {
  id: number
  event: string
  payload: unknown
  timestamp: number
  json: string
}

interface TailEvent {
  event?: string
  payload?: unknown
  data?: unknown
}

type TailEvents = (scanId: ScanId) => AsyncIterable<TailEvent>

export type EventSeverityFilter = 'all' | 'error' | 'complete' | 'progress'

const TERMINAL_EVENTS = new Set(['scan:complete', 'scan:cancelled', 'scan:error', 'scan:failed'])
const DEFAULT_MAX_EVENTS = 1000

export function createScanEventStream(deps: {
  scanId: ScanId
  tailEvents: TailEvents
  requestFrame?: (cb: () => void) => void
  maxEvents?: number
}) {
  const events = ref<StreamEvent[]>([])
  let eventSeq = 0

  const listening = ref(false)
  const connected = ref(false)
  const streamError = ref<string | null>(null)
  const reconnectAttempts = ref(0)
  const follow = ref(true)
  const scrollRef = ref<HTMLElement>()

  const MAX_EVENTS = deps.maxEvents ?? DEFAULT_MAX_EVENTS
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let resolveReconnectDelay: (() => void) | null = null
  let stopping = false
  let sawTerminal = false
  let droppedCount = 0
  const dropped = ref(0)

  const requestFrame = deps.requestFrame ?? ((cb: () => void) => {
    if (import.meta.client)
      requestAnimationFrame(cb)
    else setTimeout(cb, 0)
  })

  let scrollQueued = false
  function scheduleScroll() {
    if (!follow.value || scrollQueued)
      return
    scrollQueued = true
    requestFrame(() => {
      scrollQueued = false
      if (follow.value && scrollRef.value)
        scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    })
  }

  function resetEvents() {
    events.value = []
    eventSeq = 0
    droppedCount = 0
    dropped.value = 0
  }

  async function connectOnce(): Promise<void> {
    const stream = deps.tailEvents(deps.scanId)
    // Each (re)connection replays the scan's full event log from the start, so
    // reset the buffer on attach; otherwise reconnects stack duplicate history.
    resetEvents()
    connected.value = true
    for await (const evt of stream) {
      if (stopping)
        break

      const name = evt.event ?? 'event'
      const payload = evt.payload ?? evt.data ?? evt
      let json = ''
      try {
        json = JSON.stringify(payload, null, 2)
      }
      catch {
        json = String(payload)
      }

      events.value.push({
        id: eventSeq++,
        event: name,
        payload,
        timestamp: Date.now(),
        json,
      })

      if (events.value.length > MAX_EVENTS) {
        events.value.shift()
        dropped.value = ++droppedCount
      }

      streamError.value = null
      reconnectAttempts.value = 0
      if (TERMINAL_EVENTS.has(name))
        sawTerminal = true
      scheduleScroll()
    }
  }

  async function runListenLoop() {
    while (listening.value) {
      if (stopping)
        break

      try {
        await connectOnce()
      }
      catch (err: unknown) {
        if (stopping)
          break
        streamError.value = err instanceof Error ? err.message : 'The event stream disconnected.'
      }
      finally {
        connected.value = false
      }

      if (sawTerminal) {
        listening.value = false
        break
      }
      if (!listening.value || stopping)
        break

      reconnectAttempts.value++
      const delay = Math.min(5000, 2 ** Math.min(reconnectAttempts.value - 1, 3) * 1000)
      await new Promise<void>((resolve) => {
        resolveReconnectDelay = resolve
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          resolveReconnectDelay = null
          resolve()
        }, delay)
      })
    }
  }

  function startStream() {
    if (listening.value)
      return
    listening.value = true
    stopping = false
    sawTerminal = false
    streamError.value = null
    reconnectAttempts.value = 0
    resetEvents()
    void runListenLoop()
  }

  function stopStream() {
    stopping = true
    listening.value = false
    connected.value = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (resolveReconnectDelay) {
      resolveReconnectDelay()
      resolveReconnectDelay = null
    }
  }

  const textFilter = ref('')
  const severityFilter = ref<EventSeverityFilter>('all')

  const filteredEvents = computed(() => {
    const q = textFilter.value.trim().toLowerCase()
    const sev = severityFilter.value
    return events.value.filter((e) => {
      if (sev !== 'all') {
        const name = e.event.toLowerCase()
        if (sev === 'error' && !(name.includes('error') || name.includes('failed')))
          return false
        if (sev === 'complete' && !(name.includes('complete') || name.includes('passed')))
          return false
        if (sev === 'progress' && !(name.includes('progress') || name.includes('scanning')))
          return false
      }
      if (!q)
        return true
      if (e.event.toLowerCase().includes(q))
        return true
      return e.json.toLowerCase().includes(q)
    })
  })

  return {
    MAX_EVENTS,
    events,
    listening,
    connected,
    streamError,
    follow,
    scrollRef: scrollRef as Ref<HTMLElement | undefined>,
    dropped,
    textFilter,
    severityFilter,
    filteredEvents,
    startStream,
    stopStream,
  }
}

export function useScanEventStream(scanId: ScanId) {
  const api = useApi()
  const stream = createScanEventStream({
    scanId,
    tailEvents: scanId => api['events.tail']({ scanId, follow: true }) as unknown as AsyncIterable<TailEvent>,
  })
  onUnmounted(() => stream.stopStream())
  return stream
}

export function eventColor(event: string) {
  const name = event.toLowerCase()
  if (name.includes('error') || name.includes('failed'))
    return 'error' as const
  if (name.includes('complete') || name.includes('passed'))
    return 'primary' as const
  if (name.includes('progress') || name.includes('scanning'))
    return 'info' as const
  return 'neutral' as const
}

export function formatEventTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
}
