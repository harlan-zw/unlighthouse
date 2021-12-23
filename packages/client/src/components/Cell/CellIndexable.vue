<script lang="ts" setup>
import { get } from 'lodash-es'
import { UnlighthouseColumn, UnlighthouseRouteReport } from '@unlighthouse/core'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
  value: any
}>()

</script>
<template>
  <div v-if="value" class="flex w-full justify-center">
    <audit-result :value="{ score: value.score }" />
  </div>
</template>
