<script setup lang="ts">
defineProps<{
  rows?: number
}>()
</script>

<template>
  <div class="space-y-3" role="status" aria-live="polite" aria-busy="true">
    <span class="sr-only">Loading…</span>
    <div v-for="i in rows ?? 3" :key="i" class="flex items-center gap-3">
      <UiSkeleton type="circle" :base="32" :index="i" />
      <div class="flex-1 space-y-1.5">
        <UiSkeleton :base="100" :range="60" :index="i" />
        <UiSkeleton :base="140" :range="80" :index="i + 10" />
      </div>
    </div>
  </div>
</template>
