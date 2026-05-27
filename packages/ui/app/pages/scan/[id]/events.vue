<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

const route = useRoute()
const scanId = route.params.id as string
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string

const events = ref<Array<{ event: string, payload: any, timestamp: number }>>([])
const streaming = ref(false)
const follow = ref(true)
const reader = ref<ReadableStreamDefaultReader | null>(null)
const scrollRef = ref<HTMLElement>()

async function startStream() {
  if (streaming.value) return
  streaming.value = true
  events.value = []

  try {
    const res = await fetch(`${baseUrl}/events/tail?scanId=${scanId}&follow=true`, {
      headers: { Accept: 'application/x-ndjson' },
    })
    if (!res.ok || !res.body) {
      streaming.value = false
      return
    }

    reader.value = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.value.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (line) {
          try {
            const parsed = JSON.parse(line)
            events.value.push({
              event: parsed.event,
              payload: parsed.payload || parsed.data || parsed,
              timestamp: Date.now(),
            })
            if (follow.value) {
              nextTick(() => {
                if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
              })
            }
          }
          catch {}
        }
        nl = buffer.indexOf('\n')
      }
    }
  }
  catch {}
  finally {
    streaming.value = false
    reader.value = null
  }
}

function stopStream() {
  reader.value?.cancel()
  reader.value = null
  streaming.value = false
}

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
    // Cheap full-payload search — payloads are small (sub-1KB typically)
    // and the alternative (recursive walk) is overkill for an event log.
    try {
      return JSON.stringify(e.payload).toLowerCase().includes(q)
    }
    catch {
      return false
    }
  })
})

function eventColor(event: string) {
  if (event.includes('error') || event.includes('failed')) return 'destructive' as const
  if (event.includes('complete') || event.includes('passed')) return 'default' as const
  if (event.includes('progress') || event.includes('scanning')) return 'secondary' as const
  return 'outline' as const
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
}
</script>

<template>
  <div class="space-y-6">
    <ScanNav />
    <h1 class="text-xl font-bold tracking-tight">Event Stream</h1>

    <div class="flex items-center gap-4">
      <Button v-if="!streaming" @click="startStream">
        <Icon name="lucide:play" class="size-4 mr-2" />
        Start Stream
      </Button>
      <Button v-else variant="outline" @click="stopStream">
        <Icon name="lucide:square" class="size-4 mr-2" />
        Stop
      </Button>

      <div class="flex items-center gap-2">
        <Switch id="follow" v-model:checked="follow" />
        <Label for="follow" class="text-sm">Auto-scroll</Label>
      </div>

      <Badge v-if="streaming" variant="secondary" class="animate-pulse">
        <span class="relative flex size-2 mr-1.5">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        Live
      </Badge>

      <span class="text-sm text-muted-foreground ml-auto tabular-nums">
        <template v-if="textFilter || severityFilter !== 'all'">{{ filteredEvents.length }} of {{ events.length }}</template>
        <template v-else>{{ events.length }} events</template>
      </span>
    </div>

    <!-- Filter bar — text searches event name + payload, chips bucket by
         severity. Filtering is client-side over the buffered list, so
         changing filters never drops or re-orders incoming events. -->
    <div class="flex items-center gap-3 flex-wrap">
      <div class="relative flex-1 max-w-sm">
        <Icon name="lucide:search" class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input v-model="textFilter" placeholder="Filter events..." class="pl-8 h-8 text-xs" />
      </div>
      <div class="flex items-center gap-1">
        <Button
          v-for="sev in (['all', 'error', 'complete', 'progress'] as const)"
          :key="sev"
          type="button"
          size="sm"
          :variant="severityFilter === sev ? 'default' : 'outline'"
          class="h-7 text-[11px] capitalize"
          @click="severityFilter = sev"
        >
          {{ sev }}
        </Button>
      </div>
    </div>

    <Card>
      <CardContent class="p-0">
        <div ref="scrollRef" class="h-[500px] overflow-y-auto font-mono text-xs">
          <div v-if="!events.length" class="text-center py-16 text-muted-foreground text-sm">
            <Icon name="lucide:radio" class="size-8 mx-auto mb-3 opacity-50" />
            <p v-if="!streaming">Click "Start Stream" to begin receiving events.</p>
            <p v-else>Waiting for events...</p>
          </div>
          <div v-else-if="!filteredEvents.length" class="text-center py-16 text-muted-foreground text-sm">
            <Icon name="lucide:search-x" class="size-8 mx-auto mb-3 opacity-50" />
            <p>No events match the current filter.</p>
          </div>
          <div
            v-for="(e, i) in filteredEvents"
            :key="i"
            class="flex items-start gap-3 px-4 py-2 border-b last:border-0 hover:bg-muted/50"
          >
            <span class="text-muted-foreground shrink-0 pt-0.5 tabular-nums">{{ formatTime(e.timestamp) }}</span>
            <Badge :variant="eventColor(e.event)" class="text-[10px] shrink-0">{{ e.event }}</Badge>
            <pre class="text-muted-foreground whitespace-pre-wrap break-all flex-1">{{ JSON.stringify(e.payload, null, 2) }}</pre>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
