<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

const route = useRoute()
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string
const scanId = route.params.id as string

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
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="`/scan/${scanId}/overview`">
          <Icon name="lucide:arrow-left" class="size-4 mr-1" />
          Overview
        </NuxtLink>
      </Button>
      <h1 class="text-xl font-bold tracking-tight">Event Stream</h1>
    </div>

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

      <span class="text-sm text-muted-foreground ml-auto tabular-nums">{{ events.length }} events</span>
    </div>

    <Card>
      <CardContent class="p-0">
        <div ref="scrollRef" class="h-[500px] overflow-y-auto font-mono text-xs">
          <div v-if="!events.length" class="text-center py-16 text-muted-foreground text-sm">
            <Icon name="lucide:radio" class="size-8 mx-auto mb-3 opacity-50" />
            <p v-if="!streaming">Click "Start Stream" to begin receiving events.</p>
            <p v-else>Waiting for events...</p>
          </div>
          <div
            v-for="(e, i) in events"
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
