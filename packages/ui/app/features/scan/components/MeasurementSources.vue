<script setup lang="ts">
import type { PerformanceSource } from '@unlighthouse/contracts/types/atoms'
import { performanceSourceDetails } from '~/features/scan/pack-presentation'

const props = defineProps<{ sources: PerformanceSource[] }>()
const descriptions = computed(() => [...new Set(props.sources.map(source => performanceSourceDetails(source).join(' · ')))])
</script>

<template>
  <Disclosure v-if="descriptions.length" class="mt-2 text-left text-xs text-muted">
    <template #summary>
      Source details
    </template>
    <ul class="space-y-2 pt-2">
      <li v-for="description in descriptions" :key="description" class="break-words">
        {{ description }}
      </li>
    </ul>
  </Disclosure>
</template>
