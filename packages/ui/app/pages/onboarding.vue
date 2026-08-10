<script setup lang="ts">
import NewScanForm from '~/features/scan/components/NewScanForm.vue'

// First-run scan setup. The `onboarding` middleware on `/` sends users here
// when there are no sites and no scans yet; it's also reachable directly.
definePageMeta({ layout: 'onboarding' })
usePageTitle('First Audit')

const { unlighthouseVersion } = useRuntimeConfig().public
</script>

<template>
  <div class="w-full space-y-5">
    <div class="flex min-h-12 flex-wrap items-center justify-center gap-3">
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width="1024"
        height="1024"
        class="size-12 rounded-lg object-cover ring-1 ring-default [box-shadow:var(--elevation-raised)]"
      >

      <h1 class="text-title">
        Unlighthouse
      </h1>

      <UiChip purpose="count" size="sm" mono>
        v{{ unlighthouseVersion }}
      </UiChip>
    </div>

    <NewScanForm hide-cancel emphasis focused />

    <div class="flex justify-center pt-1">
      <a
        href="https://github.com/harlan-zw/unlighthouse"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Unlighthouse on GitHub"
        class="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-highlighted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
      >
        <UiIcon name="github" class="size-4.5" aria-hidden="true" />
        <span>GitHub</span>
      </a>
    </div>
  </div>
</template>
