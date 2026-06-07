<script setup lang="ts">
import { computed } from 'vue'

const { domain, size = 20, alt = '' } = defineProps<{
  domain: string
  size?: number
  alt?: string
}>()

const cleanDomain = computed(() => domain.replace(/^sc-domain:/, ''))
const src = computed(() => `https://www.google.com/s2/favicons?domain=${cleanDomain.value}&sz=128`)
</script>

<template>
  <img
    :src="src"
    :alt="alt"
    :width="size"
    :height="size"
    loading="lazy"
    decoding="async"
    class="rounded shrink-0"
  >
</template>
