<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/contracts'
import { get, groupBy, sum } from 'lodash-es'
import { useUnlighthouseConfig } from '~/composables/useUnlighthouseConfig'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const { website } = useUnlighthouseConfig()

interface NetworkRequestItem {
  resourceType: string
  transferSize: number
  url: string
  networkEndTime: number
  networkRequestTime: number
}

interface NetworkRequestsAudit {
  details?: {
    items?: NetworkRequestItem[]
  }
}

interface RequestGroup {
  count: number
  items: NetworkRequestItem[]
  size: string
}

const value = computed<NetworkRequestsAudit | undefined>(() => {
  if (!props.column.key)
    return undefined
  return get(props.report, props.column.key) as NetworkRequestsAudit | undefined
})

const items = computed(() => value.value?.details?.items ?? [])

const requests = computed<Record<string, NetworkRequestItem[]>>(() => {
  return groupBy(items.value, i => i.resourceType)
})

const totalTransfer = computed(() => formatBytes(sum(items.value.map(i => i.transferSize))))

const requestsMapped = computed(() => {
  const res: Record<string, RequestGroup> = {}

  for (const resourceType in requests.value) {
    const items = requests.value[resourceType]
    if (!items)
      continue
    res[resourceType] = {
      count: items.length,
      items,
      size: formatBytes(sum(items.map(i => i.transferSize))),
    }
  }
  return res
})
</script>

<template>
  <div v-if="value" class="text-sm">
    <div class="opacity-90 flex items-center mb-1">
      <span>{{ totalTransfer }}</span>
      <span class="opacity-70 ml-1">{{ items.length }} total</span>
    </div>
    <div class="grid gap-2 grid-cols-2">
      <div v-for="(group, resourceType) in requestsMapped" :key="resourceType" class="text-xs flex items-center">
        <tooltip>
          <span>{{ group.count > 1 ? group.count : '' }} {{ resourceType }}{{ group.count > 1 ? 's' : '' }}</span>
          <span class="opacity-70 ml-2">{{ group.size }}</span>
          <template #tooltip>
            <div v-for="(item, key) in group.items" :key="key" class="mb-1 flex text-xs ">
              <span class="break-all opacity-90 grow"><a :href="item.url" class="hover:no-underline underline">{{ item.url.replace(website, '') }}</a></span>
              <span class="opacity-70 whitespace-nowrap ml-1 shrink break-none">{{ formatBytes(item.transferSize) }}</span>
              <span class="opacity-70 whitespace-nowrap ml-1 shrink">{{ Math.round(item.networkEndTime - item.networkRequestTime) }}ms</span>
            </div>
          </template>
        </tooltip>
      </div>
    </div>
  </div>
</template>
