<script setup lang="ts">
import { eventColor, formatEventTime, useScanEventStream } from '~/features/scan/event-stream'
import { getScanId, useScanBase } from '~/features/scan/route-context'

definePageMeta({ layout: 'scan' })
useScanPageTitle('Event Stream')

const scanId = getScanId()
const { scanBase } = useScanBase()
const severityOptions = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Error' },
  { value: 'complete', label: 'Complete' },
  { value: 'progress', label: 'Progress' },
]
const {
  MAX_EVENTS,
  events,
  listening,
  connected,
  streamError,
  follow,
  scrollRef,
  dropped,
  textFilter,
  severityFilter,
  filteredEvents,
  startStream,
  stopStream,
} = useScanEventStream(scanId)
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader
      title="Event Stream"
      description="Live activity from the scan host — watch routes being queued, audited, and completed in real time as the scan runs. Useful for following an in-progress scan or debugging why a route stalled or failed."
      flush
    />

    <div class="flex items-center gap-4 flex-wrap">
      <UiButton v-if="!listening" purpose="cta" icon="play" @click="startStream">
        Start Stream
      </UiButton>
      <UiButton v-else purpose="secondary" icon="stop" @click="stopStream">
        Stop
      </UiButton>

      <USwitch
        v-model="follow"
        label="Auto-scroll"
        :ui="{ base: 'min-h-11 min-w-11 lg:min-h-5 lg:min-w-9' }"
      />

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
        <UiIcon name="loading" class="size-3 animate-spin" />
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
      <UInput
        v-model="textFilter"
        icon="search"
        placeholder="Filter events..."
        aria-label="Filter events"
        size="sm"
        class="flex-1 max-w-sm"
        :ui="{ base: 'min-h-11 lg:min-h-8' }"
      />
      <UiTogglePill v-model="severityFilter" :options="severityOptions" label="Event severity" />
    </div>

    <div class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 overflow-hidden">
      <div ref="scrollRef" class="h-[500px] overflow-y-auto font-mono text-xs">
        <!-- Listening, nothing in yet. We stay attached (reconnecting in the
               background) until the user hits Stop, so this is a patient
               waiting state, not a dead end. -->
        <div v-if="listening && !events.length" class="text-center py-16 text-sm">
          <UiIcon :name="connected ? 'activity' : 'loading'" class="size-8 mx-auto mb-3 text-muted/60" :class="{ 'animate-spin': !connected }" />
          <p class="text-default font-medium">
            Listening for events…
          </p>
          <p class="text-muted mt-1 max-w-md mx-auto">
            <template v-if="connected">
              Connected — route lifecycle, progress and completion events will appear here as the scan runs.
            </template>
            <template v-else>
              Waiting to connect to the scan host. The feed stays open and reconnects on its own — start (or wait for) a scan and events will stream in. Hit Stop any time.
            </template>
          </p>
          <p v-if="streamError" class="text-dimmed text-xs mt-2">
            Last issue: {{ streamError }}
          </p>
          <UiButton purpose="quiet" size="sm" icon="list" class="mt-4" :to="`${scanBase}/routes`">
            View completed routes
          </UiButton>
        </div>
        <!-- Idle (user hasn't started). -->
        <div v-else-if="!events.length" class="text-center py-16 text-muted text-sm">
          <UiIcon name="activity" class="size-8 mx-auto mb-3 opacity-50" />
          <p class="text-default font-medium">
            Live scan events
          </p>
          <p class="mt-1 max-w-md mx-auto">
            Press "Start Stream" to subscribe to this scan's activity feed — route lifecycle, progress, completion, and error events arrive here as they happen. The feed stays open and reconnects until you stop it, so it'll catch a scan that starts later too.
          </p>
        </div>
        <div v-else-if="!filteredEvents.length" class="text-center py-16 text-muted text-sm">
          <UiIcon name="search-x" class="size-8 mx-auto mb-3 opacity-50" />
          <p>No events match the current filter.</p>
        </div>
        <div
          v-for="e in filteredEvents"
          :key="e.id"
          v-memo="[e.id]"
          class="flex items-start gap-3 px-4 py-2 border-b last:border-0 hover:bg-elevated/50"
        >
          <span class="text-muted shrink-0 pt-0.5 tabular-nums">{{ formatEventTime(e.timestamp) }}</span>
          <UBadge :color="eventColor(e.event)" variant="soft" class="text-[10px] shrink-0">
            {{ e.event }}
          </UBadge>
          <pre class="text-muted whitespace-pre-wrap break-all flex-1">{{ e.json }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
