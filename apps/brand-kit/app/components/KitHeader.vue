<script setup lang="ts">
defineProps<{
  title: string
  eyebrow?: string
  description?: string
}>()
</script>

<template>
  <header class="space-y-2 pb-6 border-b border-default">
    <div v-if="eyebrow" class="text-[10px] uppercase tracking-[0.18em] text-primary-500 font-mono">
      {{ eyebrow }}
    </div>
    <h1 class="text-4xl font-semibold tracking-tight text-highlighted leading-tight">
      {{ title }}
    </h1>
    <p v-if="description" class="text-base text-muted max-w-2xl">
      {{ description }}
    </p>
  </header>
</template>
