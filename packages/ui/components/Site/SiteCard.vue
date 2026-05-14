<script setup lang="ts">
import type { Site } from '~/composables/sites'
import { siteHostname } from '~/composables/sites'

const { site } = defineProps<{ site: Site }>()
</script>

<template>
  <NuxtLink
    :to="`/sites/${site.id}`"
    class="block group rounded-sm ring-1 ring-default bg-elevated/40 hover:bg-elevated/70 transition-colors p-4"
  >
    <div class="flex items-start gap-3 mb-4">
      <SiteFavicon :url="site.url" :sz="64" :alt="site.name" class="size-8" />
      <div class="flex-1 min-w-0">
        <div class="font-medium text-highlighted truncate">
          {{ site.name }}
        </div>
        <div class="text-xs text-dimmed font-mono truncate">
          {{ siteHostname(site.url) }}
        </div>
      </div>
    </div>

    <div class="pt-3 border-t border-default flex items-center justify-between text-[11px] text-dimmed">
      <span class="capitalize">{{ site.device }}</span>
      <span>Added {{ new Date(site.createdAt).toLocaleDateString() }}</span>
    </div>
  </NuxtLink>
</template>
