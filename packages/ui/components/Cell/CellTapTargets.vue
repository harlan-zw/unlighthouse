<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'

defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()
</script>

<template>
  <AuditResult v-if="value" :value="{ score: value.score, displayValue: value.displayValue?.replace(' appropriately sized tap targets', '') }" />
</template>
