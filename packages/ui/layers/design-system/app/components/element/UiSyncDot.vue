<script lang="ts" setup>
/**
 * Sync status indicator: pulsing dot + optional label.
 * Replaces repeated inline sync dot markup across SiteGroup components.
 *
 * - 'syncing' → blue pulse (bg-info)
 * - 'pending' / other -> muted pulse
 */
const { status, label, size = '1.5' } = defineProps<{
  status?: 'syncing' | 'pending' | string | null
  label?: string
  size?: '1.5' | '2'
}>()

const sizeClass = { 1.5: 'size-1.5', 2: 'size-2' } as const
</script>

<template>
  <div v-if="label" class="flex items-center gap-2">
    <span
      class="rounded-full shrink-0 motion-safe:animate-pulse"
      :class="[sizeClass[size], status === 'syncing' ? 'bg-info' : 'bg-accented']"
      aria-hidden="true"
    />
    <span class="text-xs text-muted tabular-nums">{{ label }}</span>
    <slot />
  </div>
  <span
    v-else
    class="rounded-full shrink-0 motion-safe:animate-pulse"
    :class="[sizeClass[size], status === 'syncing' ? 'bg-info' : 'bg-accented']"
    role="img"
    :aria-label="status === 'syncing' ? 'Syncing' : 'Sync pending'"
  />
</template>
