<script setup lang="ts">
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
  // Customise the empty-state copy per category since "No SEO issues"
  // reads differently from "No accessibility data yet."
  emptyMessage?: string
  loadingMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
  pack: '',
  emptyMessage: 'No data available. Run a scan first.',
  loadingMessage: 'Loading...',
})

const ready = computed(() => props.status !== 'pending' && !!props.report)
</script>

<template>
  <div class="space-y-6">
    <ScanNav />
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-bold tracking-tight">
        {{ title }}
      </h1>
      <span v-if="pack" class="text-[10px] uppercase tracking-wider text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono">
        {{ pack }}
      </span>
    </div>

    <div v-if="status === 'pending'" class="text-center py-12 text-muted-foreground">
      {{ loadingMessage }}
    </div>

    <div v-else-if="!ready" class="text-center py-12 text-muted-foreground">
      {{ emptyMessage }}
    </div>

    <template v-else>
      <slot />
    </template>
  </div>
</template>
