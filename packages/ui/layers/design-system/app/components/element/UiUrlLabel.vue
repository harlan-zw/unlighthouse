<script setup lang="ts">
import { computed } from 'vue'
import { prettifyUrl, urlHostname } from '../../../shared/utils/urls'

const {
  url,
  favicon = true,
  faviconSize = 16,
  external = false,
  showPath = true,
} = defineProps<{
  /** A full URL, bare hostname, or `sc-domain:` value. */
  url: string
  /** Render the favicon for the host. */
  favicon?: boolean
  faviconSize?: number
  /** Render as an external link that opens the URL in a new tab. */
  external?: boolean
  /** Keep the path in the label; when false only the hostname is shown. */
  showPath?: boolean
}>()

const host = computed(() => urlHostname(url))
const label = computed(() => (showPath ? prettifyUrl(url) : host.value))
const href = computed(() => {
  if (!external)
    return undefined
  return /^[a-z][\w+.-]*:\/\//i.test(url) ? url : `https://${host.value}`
})
</script>

<template>
  <component
    :is="external ? 'a' : 'span'"
    :href="href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener' : undefined"
    class="inline-flex min-w-0 max-w-full items-center gap-1.5"
    :class="external ? 'group/url transition-colors hover:text-primary' : ''"
  >
    <UiFavicon
      v-if="favicon && host"
      :domain="host"
      :size="faviconSize"
      :alt="`${host} favicon`"
    />
    <span translate="no" class="truncate text-sm">{{ label }}</span>
    <span v-if="external" class="sr-only">(opens in new tab)</span>
    <UiIcon
      v-if="external"
      name="external"
      class="size-3 shrink-0 text-dimmed opacity-0 transition-opacity group-hover/url:opacity-100"
      aria-hidden="true"
    />
  </component>
</template>
