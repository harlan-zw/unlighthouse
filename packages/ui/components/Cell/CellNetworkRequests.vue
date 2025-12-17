<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { get, groupBy, sum } from 'lodash-es'
import { website } from '~/composables/unlighthouse'
import { formatBytes } from '~/utils'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const value = computed(() => get(props.report, props.column.key!) as any)

interface RequestItem {
  transferSize: number
  resourceType: string
  url: string
  networkEndTime: number
  networkRequestTime: number
}

const requests = computed(() => {
  return groupBy(value.value?.details?.items || [], (i: RequestItem) => i.resourceType)
})

const totalTransfer = computed(() => formatBytes(sum(value.value?.details?.items?.map((i: RequestItem) => i.transferSize) || [])))

const requestsMapped = computed(() => {
  const res: Record<string, { count: number, size: string, items: RequestItem[] }> = {}

  for (const resourceType in requests.value) {
    const items = requests.value[resourceType] as RequestItem[]
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
      <span class="opacity-70 ml-1">{{ value.details?.items?.length || 0 }} total</span>
    </div>
    <div class="grid gap-2 grid-cols-2">
      <div v-for="(group, resourceType) in requestsMapped" :key="resourceType" class="text-xs flex items-center">
        <Tooltip>
          <span>{{ group.count > 1 ? group.count : '' }} {{ resourceType }}{{ group.count > 1 ? 's' : '' }}</span>
          <span class="opacity-70 ml-2">{{ group.size }}</span>
          <template #tooltip>
            <div v-for="(item, key) in group.items" :key="key" class="mb-1 flex text-xs ">
              <span class="break-all opacity-90 grow"><a :href="item.url" class="hover:no-underline underline">{{ item.url.replace(website, '') }}</a></span>
              <span class="opacity-70 whitespace-nowrap ml-1 shrink break-none">{{ formatBytes(item.transferSize) }}</span>
              <span class="opacity-70 whitespace-nowrap ml-1 shrink">{{ Math.round(item.networkEndTime - item.networkRequestTime) }}ms</span>
            </div>
          </template>
        </Tooltip>
      </div>
    </div>
  </div>
</template>
