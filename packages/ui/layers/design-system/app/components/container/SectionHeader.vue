<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'

// Within-a-page section title. Tiny — just a styled h3 with optional
// description + trailing actions slot. Sized down from PageHeader.

defineProps<{
  title: string
  description?: string
  icon?: UiIcon
}>()
</script>

<template>
  <div class="flex items-start justify-between gap-3 mb-2">
    <div class="min-w-0">
      <h3 class="text-heading text-default flex items-center gap-1.5">
        <UiIcon v-if="icon" :name="icon" class="size-3.5 text-dimmed" />
        {{ title }}
      </h3>
      <p v-if="description" class="text-mini text-muted mt-0.5 leading-snug">
        {{ description }}
      </p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>
