<script setup lang="ts">
import { toast } from 'vue-sonner'
import { siteSwitchDestination } from '~/features/navigation/site-switch'
import { siteSlug } from '~/utils/site'

const route = useRoute()
const router = useRouter()
const api = useApi()
const switching = ref(false)
const slug = computed(() => String(route.params.siteId || ''))
const { data, error, status, refresh } = useApiQuery('sites.list', () => ({}))
const sites = computed(() => (data.value?.sites ?? []).map(site => ({
  label: site.name || siteSlug(site.url),
  slug: siteSlug(site.url),
  url: site.url,
  description: siteSlug(site.url),
  group: site.group,
})))
const currentSite = computed(() => sites.value.find(site => site.slug === slug.value))
const name = computed(() => currentSite.value?.label || slug.value)
const items = computed(() => {
  const grouped = new Map<string, typeof sites.value>()
  for (const site of sites.value) {
    const group = site.group || ''
    const bucket = grouped.get(group) ?? []
    bucket.push(site)
    grouped.set(group, bucket)
  }
  return [...grouped.entries()].map(([group, bucket]) => [
    ...(group || grouped.size > 1 ? [{ type: 'label' as const, label: group || 'Ungrouped', slug: `group:${group}`, url: '', description: '', group }] : []),
    ...bucket,
  ])
})

async function switchSite(value: string) {
  const target = sites.value.find(site => site.slug === value)
  if (!target || value === slug.value || switching.value)
    return
  switching.value = true
  const source = { path: route.path, query: { ...route.query }, hash: route.hash }
  const history = route.params.scanId
    ? await api['history.list']({ site: target.url, page: 1, pageSize: 1 })
        .then(data => ({ _tag: 'ok' as const, data }))
        .catch(error => ({ _tag: 'err' as const, error: normalizeApiError(error) }))
    : undefined
  if (history?._tag === 'err')
    toast.error('Could not load scan history. Opening the site.', { description: history.error.message })
  const latestScanId = history?._tag === 'ok' ? history.data.items[0]?.scanId : undefined
  await router.push(siteSwitchDestination(source, value, latestScanId))
    .finally(() => { switching.value = false })
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-1">
    <USelectMenu
      v-if="sites.length > 1 && !error"
      :model-value="slug"
      :items="items"
      value-key="slug"
      :filter-fields="['label', 'description']"
      :search-input="{ placeholder: 'Search sites' }"
      :disabled="switching"
      :loading="switching"
      variant="ghost"
      color="neutral"
      aria-label="Switch site"
      :ui="{ base: 'min-h-11 max-w-[min(18rem,50vw)] text-sm font-semibold lg:min-h-9', content: 'w-72 max-w-[calc(100vw-2rem)]', item: 'min-h-11 lg:min-h-9' }"
      @update:model-value="switchSite"
    >
      <template #leading>
        <UiFavicon :domain="slug" :size="18" alt="" />
      </template>
      <span class="truncate">{{ name }}</span>
      <template #item-leading="{ item }">
        <UiFavicon v-if="item.url" :domain="item.slug" :size="18" alt="" />
      </template>
      <template #empty>
        No matching sites
      </template>
    </USelectMenu>
    <NuxtLink
      v-else
      :to="`/sites/${encodeURIComponent(slug)}`"
      class="flex min-h-11 min-w-0 items-center gap-2 px-1 text-sm font-semibold lg:min-h-9"
    >
      <UiFavicon :domain="slug" :size="18" alt="" />
      <span class="truncate">{{ name }}</span>
    </NuxtLink>
    <UiButton v-if="error" purpose="quiet" icon="refresh" aria-label="Retry sites" class="min-h-11 min-w-11 lg:min-h-9 lg:min-w-9" @click="() => refresh()" />
    <UiIcon v-else-if="status === 'pending'" name="loading" class="size-4 motion-safe:animate-spin text-muted" aria-label="Loading sites" />
  </div>
</template>
