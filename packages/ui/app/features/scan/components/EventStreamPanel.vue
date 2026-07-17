<script setup lang="ts">
// Extracted from the deleted `/events` page (D-049): Overview's Events drawer
// mounts this with `v-if="open"` so `useScanEventStream` connects only while
// the drawer is open and stops (via its own `onUnmounted`) on close.
import type { ScanId } from '@unlighthouse/contracts'
import { eventColor, formatEventTime, useScanEventStream } from '~/features/scan/event-stream'

const props = defineProps<{
  scanId: ScanId
  scanBase: string
}>()

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
  dropped,
  textFilter,
  severityFilter,
  filteredEvents,
  startStream,
  stopStream,
} = useScanEventStream(props.scanId)

// Opening the drawer is the subscribe intent; connect immediately rather
// than asking for a second click. Stop stays manual (and unmount stops too).
onMounted(startStream)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4 flex-wrap">
      <UiButton v-if="!listening" purpose="cta" size="sm" icon="play" @click="startStream">
        Start stream
      </UiButton>
      <UiButton v-else purpose="secondary" size="sm" icon="stop" @click="stopStream">
        Stop stream
      </UiButton>

      <!-- Connected + receiving -->
      <UiChip v-if="listening && connected" purpose="status" status="success" class="motion-safe:animate-pulse">
        <span class="relative flex size-2 mr-1.5">
          <span class="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-success opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        Live
      </UiChip>
      <!-- Listening, but the tail dropped and we're between reconnects -->
      <UiChip v-else-if="listening" purpose="status" status="warning">
        <UiIcon name="loading" class="size-3 animate-spin" />
        Reconnecting…
      </UiChip>

      <span class="text-sm text-muted ml-auto tabular-nums">
        <template v-if="textFilter || severityFilter !== 'all'">{{ filteredEvents.length }} of {{ events.length }}</template>
        <template v-else>{{ events.length }} events</template>
        <span v-if="dropped > 0" class="text-dimmed"> · {{ dropped }} older event{{ dropped === 1 ? '' : 's' }} trimmed; showing the most recent {{ MAX_EVENTS }}</span>
      </span>
    </div>

    <!-- Filter bar — text searches event name + payload, chips bucket by
         severity. Filtering is client-side over the buffered list, so
         changing filters never drops or re-orders incoming events. -->
    <div class="flex items-center gap-3 flex-wrap">
      <UInput
        v-model="textFilter"
        name="event-filter"
        type="search"
        icon="search"
        placeholder="Filter events…"
        autocomplete="off"
        aria-label="Filter events"
        size="sm"
        class="flex-1 max-w-sm"
        :ui="{ base: 'min-h-11 lg:min-h-8' }"
      />
      <UiTogglePill v-model="severityFilter" :options="severityOptions" label="Event severity" />
    </div>

    <LogStream
      v-model:auto-scroll="follow"
      title="Events"
      :count="filteredEvents.length"
      height="65dvh"
      :dropped-note="dropped > 0 ? `${dropped} trimmed` : undefined"
    >
      <template #empty>
        <!-- Listening, nothing in yet. We stay attached (reconnecting in the
             background) until the user hits Stop, so this is a patient
             waiting state, not a dead end. -->
        <template v-if="listening && !events.length">
          <UiIcon :name="connected ? 'activity' : 'loading'" class="size-8 mx-auto mb-3 text-muted/60" :class="{ 'animate-spin': !connected }" />
          <p class="text-default font-medium">
            Listening for events…
          </p>
          <p class="text-muted mt-1 max-w-md mx-auto">
            <template v-if="connected">
              Connected: route lifecycle, progress and completion events will appear here as the scan runs.
            </template>
            <template v-else>
              Waiting to connect to the scan host. The feed stays open and reconnects on its own; start (or wait for) a scan and events will stream in. Hit Stop any time.
            </template>
          </p>
          <p v-if="streamError" class="text-dimmed text-xs mt-2">
            Last issue: {{ streamError }}
          </p>
          <UiButton purpose="quiet" size="sm" icon="list" class="mt-4" :to="`${scanBase}/routes`">
            View completed routes
          </UiButton>
        </template>
        <!-- Idle (user hasn't started). -->
        <template v-else-if="!events.length">
          <UiIcon name="activity" class="size-8 mx-auto mb-3 opacity-50" />
          <p class="text-default font-medium">
            Live scan events
          </p>
          <p class="mt-1 max-w-md mx-auto">
            Subscribing to this scan's activity feed: route lifecycle, progress, completion, and error events arrive here as they happen. The feed stays open and reconnects until you stop it, so it'll catch a scan that starts later too.
          </p>
        </template>
        <template v-else>
          <UiIcon name="search-x" class="size-8 mx-auto mb-3 opacity-50" />
          <p>No events match the current filter.</p>
        </template>
      </template>
      <div
        v-for="e in filteredEvents"
        :key="e.id"
        v-memo="[e.id]"
        class="flex items-start gap-3 px-2 py-2 border-b border-default last:border-0 hover:bg-muted/60 rounded"
      >
        <span class="text-dimmed shrink-0 pt-0.5 tabular-nums">{{ formatEventTime(e.timestamp) }}</span>
        <UiChip purpose="status" :status="eventColor(e.event)" class="shrink-0">
          {{ e.event }}
        </UiChip>
        <CodeBlock :code="e.json" dense class="flex-1" max-height="none" />
      </div>
    </LogStream>
  </div>
</template>
