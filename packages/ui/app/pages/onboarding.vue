<script setup lang="ts">
// First-run welcome. The `onboarding` middleware on `/` sends users here
// when there are no sites and no scans yet; it's also reachable directly.
//
// Pilot for the shadcn → @nuxt/ui migration: this screen's chrome now uses
// @nuxt/ui primitives + the design-system layer's theme (semantic tokens like
// `text-muted` / `text-inverted`, violet `primary`). NewScanForm is still
// shadcn-based and renders fine alongside — the two stacks coexist.
definePageMeta({ layout: 'root' })
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6 py-8">
    <div class="text-center space-y-3">
      <div class="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-inverted">
        <UIcon name="i-lucide-radar" class="size-6" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-highlighted">
        Welcome to Unlighthouse
      </h1>
      <p class="text-sm text-muted">
        Scan your first site to get Lighthouse scores across every page. Enter a URL below to begin.
      </p>
    </div>

    <NewScanForm hide-cancel />

    <p class="text-center text-xs text-muted">
      Full-site mode discovers pages via the sitemap and crawling. You can manage sites later from the sidebar.
    </p>
  </div>
</template>
