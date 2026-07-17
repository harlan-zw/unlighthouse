<script setup lang="ts">
import { computed } from 'vue'

const {
  url,
  label,
  to,
  maxWidth = '280px',
  external = true,
} = defineProps<{
  url: string
  /** Display text. Defaults to the pathname portion of url. */
  label?: string
  /** Internal route. When set, renders NuxtLink to this route instead of an external anchor. */
  to?: string
  maxWidth?: string
  /** Show external open icon on hover/focus. Defaults to true when no internal `to` is provided. */
  external?: boolean
}>()

const display = computed(() => {
  if (label)
    return label
  try {
    const u = new URL(url)
    return u.pathname + u.search
  }
  catch (_err) {
    // Table cells may receive already-formatted paths.
    return url
  }
})
</script>

<template>
  <div class="group/path inline-flex items-center gap-1.5 min-w-0">
    <UiTooltip v-if="to" :text="url" trigger-as="child">
      <NuxtLink
        :to="to"
        class="font-sans text-xs text-default hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded transition-colors truncate"
        :style="{ maxWidth }"
      >
        {{ display }}
      </NuxtLink>
    </UiTooltip>
    <UiTooltip v-else :text="url" trigger-as="child">
      <a
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        class="font-sans text-xs text-default hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded transition-colors truncate"
        :style="{ maxWidth }"
      >{{ display }}</a>
    </UiTooltip>
    <UiIcon
      v-if="external && !to"
      name="arrow-up-right"
      class="size-3 text-dimmed opacity-0 group-hover/path:opacity-100 group-focus-within/path:opacity-100 transition-opacity shrink-0"
      aria-hidden="true"
    />
  </div>
</template>
