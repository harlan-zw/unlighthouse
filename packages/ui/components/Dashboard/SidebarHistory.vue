<script setup lang="ts">
import { useScanHistory, extractDomain } from '~/composables/history'

const { closeNav } = defineProps<{
  limit?: number
  closeNav?: () => void
}>()

const route = useRoute()
const { data } = useScanHistory()

const recent = computed(() => {
  const scans = data.value?.scans ?? []
  return [...scans]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 8)
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2 px-1">
      <span class="text-[11px] font-semibold text-dimmed uppercase tracking-widest px-1">
        Recent scans
      </span>
      <NuxtLink
        to="/history"
        class="text-[11px] text-dimmed hover:text-default transition-colors px-1"
        @click="closeNav?.()"
      >
        All
      </NuxtLink>
    </div>
    <nav v-if="recent.length" class="space-y-0.5 bg-muted/40 rounded p-1">
      <NuxtLink
        v-for="scan in recent"
        :key="scan.id"
        :to="`/results/${scan.id}`"
        class="flex items-center gap-1.5 px-1.5 py-1 rounded text-sm transition-colors"
        :class="route.path.startsWith(`/results/${scan.id}`)
          ? 'bg-elevated text-highlighted'
          : 'text-muted hover:text-default hover:bg-elevated/70'"
        @click="closeNav?.()"
      >
        <img
          :src="`https://www.google.com/s2/favicons?domain=${extractDomain(scan.site)}&sz=32`"
          :alt="scan.site"
          class="w-3.5 h-3.5 rounded shrink-0"
          loading="lazy"
          width="14"
          height="14"
        >
        <span class="truncate text-[13px]">{{ extractDomain(scan.site) }}</span>
        <UIcon
          v-if="scan.status === 'running'"
          name="i-svg-spinners-90-ring-with-bg"
          class="size-3 ml-auto text-primary shrink-0"
        />
      </NuxtLink>
    </nav>
    <p v-else class="px-2 text-xs text-dimmed">
      No scans yet
    </p>
  </div>
</template>
