<script setup lang="ts">
import NewScanForm from '~/features/scan/components/NewScanForm.vue'

// First-run welcome. The `onboarding` middleware on `/` sends users here
// when there are no sites and no scans yet; it's also reachable directly.
usePageTitle('Welcome')
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6 py-8">
    <div class="text-center space-y-3">
      <div class="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-inverted">
        <UiIcon name="radar" class="size-6" />
      </div>
      <h1 class="text-title">
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
