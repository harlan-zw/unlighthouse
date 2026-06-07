<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'
import { m, useReducedMotion } from 'motion-v'
import { entrancePresets, entranceProps } from '../../shared/motion'

const { compact } = defineProps<{
  icon: UiIcon
  title: string
  description?: string
  compact?: boolean
}>()

const reduced = useReducedMotion()
</script>

<template>
  <!-- Compact: inline empty state for cards/lists -->
  <m.div
    v-if="compact"
    data-testid="empty-state"
    class="flex flex-col items-center justify-center h-[220px] rounded-lg border border-dashed border-default bg-muted"
    v-bind="entranceProps(entrancePresets.fadeUp, reduced)"
  >
    <UiIcon :name="icon" class="size-8 text-dimmed mb-2" />
    <p class="text-sm font-medium text-default">
      {{ title }}
    </p>
    <p v-if="description" class="text-xs text-muted mt-1 max-w-sm text-center px-4">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-3">
      <slot />
    </div>
  </m.div>

  <!-- Full: centered page-level empty state -->
  <m.div
    v-else
    data-testid="empty-state"
    class="text-center py-16 min-h-[400px] flex flex-col items-center justify-center"
    v-bind="entranceProps(entrancePresets.fadeUp, reduced)"
  >
    <div class="inline-flex items-center justify-center size-14 rounded-2xl bg-elevated border border-default mb-4">
      <UiIcon :name="icon" class="size-7 text-muted" />
    </div>
    <h3 class="text-lg font-medium text-default mb-1">
      {{ title }}
    </h3>
    <p v-if="description" class="text-sm text-muted max-w-md mx-auto leading-relaxed">
      {{ description }}
    </p>
    <div class="mt-6">
      <slot />
    </div>
    <slot name="footer" />
  </m.div>
</template>
