<script setup lang="ts">
import { siteHostname } from '~/composables/sites'

const { url, sz = 32, alt = '' } = defineProps<{
  url: string
  sz?: number
  alt?: string
}>()

const src = computed(() => `https://www.google.com/s2/favicons?domain=${siteHostname(url)}&sz=${sz}`)
</script>

<template>
  <img
    :src="src"
    :alt="alt"
    class="rounded shrink-0"
    loading="lazy"
  >
</template>
