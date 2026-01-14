<script lang="ts" setup>
import type { UnlighthouseRouteReport } from 'unlighthouse'

const props = defineProps<{
  routeName: string
  reports: UnlighthouseRouteReport[]
}>()

const { reports } = toRefs(props)
</script>

<template>
  <div>
    <template v-for="(report, index) in reports" :key="index">
      <results-route :report="report">
        <template #actions>
          <slot v-if="report?.report" name="actions" :report="report" />
        </template>
      </results-route>
    </template>
  </div>
</template>
