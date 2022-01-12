<script lang="ts" setup>
import { get, groupBy, sum } from 'lodash-es'
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { formatBytes } from '../../logic'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const value = computed(() => get(props.report, props.column.key))

type GroupedItems = [{ transferSize: number; resourceType: string }[]]

const requests = computed<GroupedItems>(() => {
  return groupBy(value.value?.details?.items || [], i => i.resourceType) as unknown as GroupedItems
})

const totalTransfer = computed(() => formatBytes(sum(value.value?.details?.items.map(i => i.transferSize))))

const requestsMapped = computed(() => {
  const res: Record<string, { count: number; size: string }> = {}
  /* eslint-disable no-restricted-syntax */
  for (const resourceType in requests.value) {
    const items = requests.value[resourceType]
    res[resourceType] = {
      count: items.length,
      size: formatBytes(sum(items.map(i => i.transferSize))),
    }
  }
  return res
})
</script>
<template>
  <div v-if="value" class="text-sm">
    <div class="text-xs opacity-90 flex items-center">
      <span>{{ value.details.items.length }}</span>
      <span class="opacity-70 ml-2">{{ totalTransfer }}</span>
    </div>
    <div v-for="(group, resourceType) in requestsMapped" :key="resourceType" class="text-xs opacity-90 flex items-center">
      <span>{{ group.count }} {{ resourceType }}</span>
      <span class="opacity-70 ml-2">{{ group.size }}</span>
    </div>
  </div>
</template>
