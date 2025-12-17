<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'
import { extractFgColor, extractBgColor } from '~/utils'

defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()
</script>

<template>
  <div v-if="value" class="w-full">
    <div class="mb-2">
      <AuditResultItemsLength :value="value" />
    </div>
    <div v-if="value.details?.items" class="max-h-[80px] overflow-y-auto w-full hidden md:block">
      <div
        v-for="({ node }, key) in value.details.items"
        :key="key"
        class="mb-1 p-1 text-xs"
        :style="{
          color: extractFgColor(node.explanation),
          backgroundColor: extractBgColor(node.explanation),
        }"
      >
        {{ node.nodeLabel }}
      </div>
    </div>
  </div>
</template>
