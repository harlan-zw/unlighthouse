<script setup lang="ts">
import type { ApiError } from '~/composables/useApiError'
// Shell for a generated pack tab (D-045). Evolved from the old
// CategoryPageShell (which every hand-built category page duplicated): same
// loading / empty / error / ready branching, plus a pack identity badge (name
// + version) since a tab is now a projection of `pack.list`, not a
// hand-labelled category.
//
//   <PackPageShell title="Core Web Vitals" pack="cwv" version="1" :status :report>
//     ... widget markup ...
//   </PackPageShell>

interface Props {
  title: string
  // Pack name — surfaced as a small badge so power users can trace "which
  // pack drove this page". Hidden when omitted.
  pack?: string
  // Pack version — shown alongside the name badge when known.
  version?: string
  status: 'idle' | 'pending' | 'success' | 'error'
  // The pack's `report` field. Null + settled status → empty state.
  report: unknown
  // Normalized primary-fetch error. When set it renders a retryable banner
  // INSTEAD of the empty state, so an unreachable backend doesn't read as
  // "no data yet".
  error?: ApiError | null
  onRetry?: () => void
  // Customise the empty-state copy per pack since "0 SEO issues" reads
  // differently from "run the accessibility pack first."
  emptyMessage?: string
  loadingMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
  pack: '',
  version: '',
  error: null,
  emptyMessage: 'Run a scan to populate this pack.',
  loadingMessage: 'Loading pack report...',
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
        <UiChip v-if="version" purpose="count" mono>
          v{{ version }}
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
