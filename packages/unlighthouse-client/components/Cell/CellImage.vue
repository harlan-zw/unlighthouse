<script lang="ts" setup>
import get from "lodash/get";
import { website } from '../../logic'
import {withBase, $URL} from 'ufo'

const props = defineProps<{
  report: UnlighthouseRouteReport,
  column: UnlighthouseColumn
}>()

const value = computed(() => {
  const val = get(props.report, props.column.key)
  // need to fix up relative image URLs
  const $url = new $URL(val)
  if (!$url.hostname) {
    return withBase(val, website)
  }
  return val
})
</script>
<template>
<img loading="lazy" class="h-100px object-contain w-full object-top object-left" height="100" :src="value" alt="share image" />
</template>
