<script setup lang="ts">

definePageMeta({ layout: 'scan' })

const api = useApi()
const scanId = getScanId()
const route = useRoute()
const scanBase = computed(() => `/sites/${route.params.siteId}/scans/${route.params.scanId}`)

// `id` is a stable, monotonic key (so `v-memo` + keyed rows never re-render an
// existing event) and `json` is the payload pretty-printed once at ingest
// rather than on every render pass.
interface StreamEvent { id: number, event: string, payload: any, timestamp: number, json: string }
const events = ref<StreamEvent[]>([])
let eventSeq = 0
// `listening` = the user wants the feed open (toggled by Start/Stop). It stays
// true across reconnects. `connected` = a tail is attached *right now*. The
// server closes a follow tail as soon as there's no live session, so to honour
// "keep it open until I stop it" we re-attach on every clean/dropped close
// (with backoff) instead of snapping back to the start state.
const listening = ref(false)
const connected = ref(false)
// Last transient connection error, shown inline while we keep retrying.
const streamError = ref<string | null>(null)
const reconnectAttempts = ref(0)
const follow = ref(true)
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const scrollRef = ref<HTMLElement>()
// Cooperative-cancel flag: stopStream() flips it, the for-await loop
// checks it and breaks. The typed iterator doesn't expose an abort
// handle (it's a plain AsyncGenerator), so this is how we stop
// consuming — the underlying reader is released when the generator
// is abandoned.
let stopping = false

// A site scan fires thousands of events. Keeping every one in a reactive array
// and rendering each as a pretty-printed <pre> row locks up the tab. Cap the
// buffer to the most recent N (the feed is a tail, not an archive — Routes/the
// report hold the durable data) so memory and DOM node count stay bounded.
const MAX_EVENTS = 1000
let droppedCount = 0
const dropped = ref(0)

// Coalesce auto-scroll: a high-frequency stream would otherwise queue a
// nextTick scroll per event. One rAF-batched scroll per frame is enough.
let scrollQueued = false
function scheduleScroll() {
  if (!follow.value || scrollQueued)
    return
  scrollQueued = true
  requestAnimationFrame(() => {
    scrollQueued = false
    if (follow.value && scrollRef.value)
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

// Consume one tail to completion. Resolves when the stream closes for any
// reason; throwing is reserved for genuine transport errors (surfaced as a
// transient banner). Returns whether it closed cleanly so the caller can pace
// reconnects.
// A terminal scan event means there's nothing more to follow — stop the listen
// loop so we don't keep re-attaching (and re-replaying the whole event log) to a
// finished scan, which is what locks the tab up.
const TERMINAL_EVENTS = new Set(['scan:complete', 'scan:cancelled', 'scan:error', 'scan:failed'])
let sawTerminal = false

async function connectOnce(): Promise<void> {
  // Typed streaming via the command client. The return is cast to AsyncIterable
  // because `defineCommand` widens `streaming: true` to `boolean`, so the
  // client's mapped type can't tell this command streams.
  const stream = api['events.tail']({ scanId, follow: true }) as unknown as AsyncIterable<{ event?: string, payload?: unknown, data?: unknown }>
  // Each (re)connection replays the scan's full event log from the start, so
  // reset the buffer on attach — otherwise reconnects would stack duplicate
  // copies of the history and balloon the list (the tab-locking bug).
  events.value = []
  eventSeq = 0
  droppedCount = 0
  dropped.value = 0
  connected.value = true
  for await (const evt of stream) {
    if (stopping) break
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
    // Trim from the front once over cap — one splice per overflow event keeps
    // the array (and the rendered list) at a fixed ceiling.
    if (events.value.length > MAX_EVENTS) {
      events.value.shift()
      dropped.value = ++droppedCount
    }
    // Any event means a healthy connection — reset the backoff.
    streamError.value = null
    reconnectAttempts.value = 0
    if (TERMINAL_EVENTS.has(name))
      sawTerminal = true
    scheduleScroll()
  }
}

// Keep a tail attached for as long as the user wants to listen. The server ends
// a follow tail whenever there's no live session (e.g. between scans), so we
// re-attach with a capped backoff rather than stopping — that's what makes the
// feed survive until the user hits Stop, and lets it pick up a scan that starts
// later.
async function runListenLoop() {
  while (listening.value && !stopping) {
    try {
      await connectOnce()
    }
    catch (err: any) {
      if (stopping)
        break
      streamError.value = err?.message || 'The event stream disconnected.'
    }
    finally {
      connected.value = false
    }
    // Scan reached a terminal state — the feed is complete, don't re-attach.
    if (sawTerminal) {
      listening.value = false
      break
    }
    if (!listening.value || stopping)
      break
    // Backoff: 1s, 2s, 4s … capped at 5s. The tail often closes instantly when
    // idle, so without this we'd hot-loop the endpoint.
    reconnectAttempts.value++
    const delay = Math.min(5000, 2 ** Math.min(reconnectAttempts.value - 1, 3) * 1000)
    await new Promise<void>((resolve) => {
      reconnectTimer = setTimeout(resolve, delay)
    })
  }
}

function startStream() {
  if (listening.value) return
  listening.value = true
  stopping = false
  sawTerminal = false
  streamError.value = null
  reconnectAttempts.value = 0
  events.value = []
  eventSeq = 0
  droppedCount = 0
  dropped.value = 0
  runListenLoop()
}

function stopStream() {
  stopping = true
  listening.value = false
  connected.value = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

// Stop consuming on unmount so we don't leak a live HTTP stream when
// the user navigates away mid-tail.
// Stop consuming + cancel any pending reconnect on unmount so we don't leak a
// live HTTP stream or a dangling timer when the user navigates away mid-tail.
onUnmounted(() => stopStream())

// Text filter + severity filter. Applied client-side over the buffered
// events array so the WS keeps streaming everything and the user can
// toggle filters without re-subscribing or losing context.
const textFilter = ref('')
const severityFilter = ref<'all' | 'error' | 'complete' | 'progress'>('all')

const filteredEvents = computed(() => {
  const q = textFilter.value.trim().toLowerCase()
  const sev = severityFilter.value
  return events.value.filter((e) => {
    if (sev !== 'all') {
      // Map the rough buckets to the same substring checks `eventColor`
      // uses below so the filter chip and badge colors stay consistent.
      const name = e.event.toLowerCase()
      if (sev === 'error' && !(name.includes('error') || name.includes('failed'))) return false
      if (sev === 'complete' && !(name.includes('complete') || name.includes('passed'))) return false
      if (sev === 'progress' && !(name.includes('progress') || name.includes('scanning'))) return false
    }
    if (!q) return true
    if (e.event.toLowerCase().includes(q)) return true
    // Search the already-serialized payload (computed once at ingest) instead
    // of re-stringifying on every keystroke × every buffered event.
    return e.json.toLowerCase().includes(q)
  })
})

function eventColor(event: string) {
  if (event.includes('error') || event.includes('failed')) return 'error' as const
  if (event.includes('complete') || event.includes('passed')) return 'primary' as const
  if (event.includes('progress') || event.includes('scanning')) return 'info' as const
  return 'neutral' as const
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
}
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="Event Stream"
      description="Live activity from the scan host — watch routes being queued, audited, and completed in real time as the scan runs. Useful for following an in-progress scan or debugging why a route stalled or failed."
      flush
    />

    <div class="flex items-center gap-4">
      <UiButton v-if="!listening" purpose="cta" icon="i-lucide-play" @click="startStream">Start Stream</UiButton>
      <UiButton v-else purpose="secondary" icon="i-lucide-square" @click="stopStream">Stop</UiButton>

      <USwitch v-model="follow" label="Auto-scroll" />

      <!-- Connected + receiving -->
      <UBadge v-if="listening && connected" color="neutral" variant="soft" class="animate-pulse">
        <span class="relative flex size-2 mr-1.5">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        Live
      </UBadge>
      <!-- Listening, but the tail dropped and we're between reconnects -->
      <UBadge v-else-if="listening" color="warning" variant="soft" class="gap-1">
        <Icon name="lucide:loader-circle" class="size-3 animate-spin" />
        Reconnecting…
      </UBadge>

      <span class="text-sm text-muted ml-auto tabular-nums">
        <template v-if="textFilter || severityFilter !== 'all'">{{ filteredEvents.length }} of {{ events.length }}</template>
        <template v-else>{{ events.length }} events</template>
        <span v-if="dropped > 0" class="text-dimmed" :title="`Showing the most recent ${MAX_EVENTS}; ${dropped} older events were trimmed`"> · {{ dropped }} trimmed</span>
      </span>
    </div>

    <!-- Filter bar — text searches event name + payload, chips bucket by
         severity. Filtering is client-side over the buffered list, so
         changing filters never drops or re-orders incoming events. -->
    <div class="flex items-center gap-3 flex-wrap">
      <UInput v-model="textFilter" icon="i-lucide-search" placeholder="Filter events..." size="xs" class="flex-1 max-w-sm" />
      <div class="flex items-center gap-1">
        <UButton
          v-for="sev in (['all', 'error', 'complete', 'progress'] as const)"
          :key="sev"
          type="button"
          size="sm"
          :color="severityFilter === sev ? 'primary' : 'neutral'"
          :variant="severityFilter === sev ? 'solid' : 'outline'"
          class="h-7 text-[11px] capitalize"
          :label="sev"
          @click="severityFilter = sev"
        />
      </div>
    </div>

    <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 overflow-hidden">
        <div ref="scrollRef" class="h-[500px] overflow-y-auto font-mono text-xs">
          <!-- Listening, nothing in yet. We stay attached (reconnecting in the
               background) until the user hits Stop, so this is a patient
               waiting state, not a dead end. -->
          <div v-if="listening && !events.length" class="text-center py-16 text-sm">
            <Icon :name="connected ? 'lucide:radio' : 'lucide:loader-circle'" class="size-8 mx-auto mb-3 text-muted/60" :class="{ 'animate-spin': !connected }" />
            <p class="text-default font-medium">Listening for events…</p>
            <p class="text-muted mt-1 max-w-md mx-auto">
              <template v-if="connected">Connected — route lifecycle, progress and completion events will appear here as the scan runs.</template>
              <template v-else>Waiting to connect to the scan host. The feed stays open and reconnects on its own — start (or wait for) a scan and events will stream in. Hit Stop any time.</template>
            </p>
            <p v-if="streamError" class="text-dimmed text-xs mt-2">Last issue: {{ streamError }}</p>
            <UiButton purpose="quiet" size="sm" icon="i-lucide-list" class="mt-4" :to="`${scanBase}/routes`">View completed routes</UiButton>
          </div>
          <!-- Idle (user hasn't started). -->
          <div v-else-if="!events.length" class="text-center py-16 text-muted text-sm">
            <Icon name="lucide:radio" class="size-8 mx-auto mb-3 opacity-50" />
            <p class="text-default font-medium">Live scan events</p>
            <p class="mt-1 max-w-md mx-auto">Press "Start Stream" to subscribe to this scan's activity feed — route lifecycle, progress, completion, and error events arrive here as they happen. The feed stays open and reconnects until you stop it, so it'll catch a scan that starts later too.</p>
          </div>
          <div v-else-if="!filteredEvents.length" class="text-center py-16 text-muted text-sm">
            <Icon name="lucide:search-x" class="size-8 mx-auto mb-3 opacity-50" />
            <p>No events match the current filter.</p>
          </div>
          <div
            v-for="e in filteredEvents"
            :key="e.id"
            v-memo="[e.id]"
            class="flex items-start gap-3 px-4 py-2 border-b last:border-0 hover:bg-elevated/50"
          >
            <span class="text-muted shrink-0 pt-0.5 tabular-nums">{{ formatTime(e.timestamp) }}</span>
            <UBadge :color="eventColor(e.event)" variant="soft" class="text-[10px] shrink-0">{{ e.event }}</UBadge>
            <pre class="text-muted whitespace-pre-wrap break-all flex-1">{{ e.json }}</pre>
          </div>
        </div>
    </div>
  </div>
</template>
