<script setup lang="ts">
import type { ApiError } from '~/composables/useApiError'
// Boilerplate shell for the per-category scan pages (Performance,
// Accessibility, SEO, Best Practices, Agentic Browsing). Owns the
// breadcrumb + title + 3-state (loading / empty / error / ready)
// branch that each page was hand-rolling identically. Reduces ~30
// lines of identical wrapper per page to:
//
//   <CategoryPageShell title="SEO" :status="status" :report="report">
//     ... page-specific blocks ...
//   </CategoryPageShell>
//
// `status` is the useAsyncData status string. `report` is the pack
// report payload; when null + status is settled we render the "no
// data yet" empty state. The default slot only renders when there's
// a report to show, so consumers can write straight-line markup
// without re-doing the null checks.

interface Props {
  title: string
  // Pack-name optional — surfaced as a small badge so power users can
  // quickly trace "which pack drove this page". Hidden when omitted.
  pack?: string
  status: 'idle' | 'pending' | 'success' | 'error'
  // The pack's `report` field. Null + settled status → empty state.
  report: unknown
  // Normalized primary-fetch error. When set it renders a retryable banner
  // INSTEAD of the empty state, so an unreachable backend doesn't read as
  // "no data yet".
  error?: ApiError | null
  onRetry?: () => void
  // Customise the empty-state copy per category since "No SEO issues"
  // reads differently from "No accessibility data yet."
  emptyMessage?: string
  loadingMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
  pack: '',
  error: null,
  emptyMessage: 'No data available. Run a scan first.',
  loadingMessage: 'Loading...',
})

useScanPageTitle(() => props.title)

const ready = computed(() => props.status !== 'pending' && !!props.report)
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="title" flush>
      <template v-if="pack" #actions>
        <UiChip purpose="count" mono>
          {{ pack }}
        </UiChip>
      </template>
    </UiPageHeader>

    <QueryError v-if="error" :error="error" :on-retry="onRetry" />

    <div v-else-if="status === 'pending'" class="space-y-3 py-2">
      <UiLoadingState :rows="3" />
      <p class="text-xs text-muted text-center">
        {{ loadingMessage }}
      </p>
    </div>

    <UiEmptyState v-else-if="!ready" icon="inbox" :title="emptyMessage" compact />

    <template v-else>
      <slot />
    </template>
  </div>
</template>
