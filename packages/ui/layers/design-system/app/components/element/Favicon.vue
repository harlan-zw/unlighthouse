<script setup lang="ts">
import { computed, ref } from 'vue'

const { domain, size = 20, alt = '' } = defineProps<{
  domain: string
  size?: number
  alt?: string
}>()

const cleanDomain = computed(() => domain.replace(/^sc-domain:/, ''))
const src = computed(() => `https://www.google.com/s2/favicons?domain=${cleanDomain.value}&sz=128`)

// The favicon service 404s for domains with no icon (e.g. example.com). Swap to
// a neutral globe glyph instead of leaving a broken image + console error.
const failed = ref(false)
</script>

<template>
  <span
    v-if="failed"
    class="inline-flex items-center justify-center rounded bg-elevated text-muted shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-label="alt"
  >
    <Icon name="lucide:globe" :style="{ width: `${Math.round(size * 0.7)}px`, height: `${Math.round(size * 0.7)}px` }" />
  </span>
  <img
    v-else
    :src="src"
    :alt="alt"
    :width="size"
    :height="size"
    loading="lazy"
    decoding="async"
    class="rounded shrink-0"
    @error="failed = true"
  >
</template>
