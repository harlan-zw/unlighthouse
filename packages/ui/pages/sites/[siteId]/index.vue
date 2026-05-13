<script setup lang="ts">
import { siteHostname, useSites } from '~/composables/sites'

definePageMeta({ layout: 'site' })

const route = useRoute()
const { getSite } = useSites()
const site = getSite(route.params.siteId as string)
</script>

<template>
  <div v-if="site">
    <header class="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted flex items-center gap-2">
          <SiteFavicon :url="site.url" :alt="site.name" class="size-5" />
          {{ site.name }}
        </h1>
        <a :href="site.url" target="_blank" class="text-sm text-muted font-mono hover:text-default transition-colors">
          {{ siteHostname(site.url) }}
        </a>
      </div>
      <UButton color="primary" icon="i-heroicons-bolt" :to="`/sites/${site.id}/scan/new`">
        Run scan
      </UButton>
    </header>

    <div class="rounded-xl ring-1 ring-default bg-elevated/40 overflow-hidden">
      <div class="flex items-center justify-between p-4 border-b border-default">
        <h2 class="font-medium text-highlighted">
          Recent scans
        </h2>
        <NuxtLink :to="`/sites/${site.id}/history`" class="text-xs text-muted hover:text-default transition-colors">
          View all →
        </NuxtLink>
      </div>
      <div class="px-4 py-8 text-center text-sm text-dimmed">
        No scans yet. <NuxtLink :to="`/sites/${site.id}/scan/new`" class="text-primary hover:underline">
          Run the first scan
        </NuxtLink>.
      </div>
    </div>
  </div>
</template>
