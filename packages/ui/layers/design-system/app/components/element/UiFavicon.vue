<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { domain, size = 20, alt = '', loading = false, decorative = false } = defineProps<{
  domain?: string
  size?: number
  alt?: string
  loading?: boolean
  decorative?: boolean
}>()

const cleanDomain = computed(() =>
  (domain ?? '')
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim(),
)

const src = computed(() => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain.value)}&sz=128`)
const failed = ref(false)

watch(cleanDomain, () => {
  failed.value = false
})

const initial = computed(() => (cleanDomain.value.replace(/^www\./, '')[0] ?? '?').toUpperCase())
const showFallback = computed(() => failed.value || !cleanDomain.value)
const a11y = computed(() =>
  decorative
    ? { 'aria-hidden': 'true' as const }
    : { 'role': 'img', 'aria-label': alt || cleanDomain.value || 'Unknown site' },
)
</script>

<template>
  <span
    v-if="loading"
    class="inline-flex items-center justify-center shrink-0 text-muted"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="alt || cleanDomain || 'Loading'"
  >
    <UiIcon name="loading" class="animate-spin motion-reduce:animate-none" :style="{ width: `${size}px`, height: `${size}px` }" />
  </span>
  <span
    v-else-if="showFallback"
    class="inline-flex items-center justify-center rounded bg-elevated border border-default text-dimmed font-semibold shrink-0 leading-none select-none"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.5)}px` }"
    v-bind="a11y"
  >
    {{ initial }}
  </span>
  <img
    v-else
    :src="src"
    :alt="decorative ? '' : alt"
    :aria-hidden="decorative ? 'true' : undefined"
    :width="size"
    :height="size"
    loading="lazy"
    decoding="async"
    class="rounded shrink-0"
    @error="failed = true"
  >
</template>
