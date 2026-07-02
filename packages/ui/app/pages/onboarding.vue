<script setup lang="ts">
import NewScanForm from '~/features/scan/components/NewScanForm.vue'

// First-run scan setup. The `onboarding` middleware on `/` sends users here
// when there are no sites and no scans yet; it's also reachable directly.
usePageTitle('First Audit')
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6 py-8">
    <div class="text-center space-y-3">
      <div class="mx-auto flex size-12 items-center justify-center rounded-lg border border-default bg-elevated text-highlighted">
        <UiIcon name="radar" class="size-6" />
      </div>
      <h1 class="text-title">
        Connect a site to run your first audit
      </h1>
      <p class="text-sm text-muted">
        Enter a URL to collect Lighthouse scores across every discovered route.
      </p>
    </div>

    <NewScanForm hide-cancel />

    <p class="text-center text-xs text-muted">
      Full-site mode discovers pages via the sitemap and crawling. You can manage sites later from the sidebar.
    </p>
  </div>
</template>
