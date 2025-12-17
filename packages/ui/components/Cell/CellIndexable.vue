<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'

defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()
</script>

<template>
  <div v-if="value" class="flex w-full justify-center">
    <span v-if="value.details?.items?.[0]?.source?.url?.endsWith('robots.txt')"><a :href="value.details?.items?.[0]?.source.url" class="underline hover:no-underline">robots.txt</a> blocking</span>
    <span v-else-if="value.details?.items?.length > 0">{{ value.details.items }}</span>
    <AuditResult :value="{ score: value.score }" />
  </div>
</template>
