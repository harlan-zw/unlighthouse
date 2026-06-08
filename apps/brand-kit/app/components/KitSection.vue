<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  code?: string
}>()
</script>

<template>
  <section class="space-y-4">
    <div class="space-y-1">
      <div class="flex items-baseline justify-between gap-4">
        <h2 class="text-xl font-semibold tracking-tight text-highlighted">
          {{ title }}
        </h2>
        <code v-if="code" class="text-[11px] font-mono text-dimmed">{{ code }}</code>
      </div>
      <p v-if="description" class="text-sm text-muted max-w-2xl">
        {{ description }}
      </p>
    </div>
    <slot />
  </section>
</template>
