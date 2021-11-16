<script setup lang="ts">
const props = defineProps<{
  value: {
    score: number
    displayValue?: string
  }
}>()

const mark = computed(() => {
  if (props.value.score >= 0.9)
    return 'pass'

  if (props.value.score >= 0.5)
    return 'average'

  return 'fail'
})
</script>
<template>
  <div class="flex items-center" :class="[mark]">
    <div class="icon w-2 h-2 mr-2"></div>
    <div v-if="typeof value.displayValue !== 'undefined'">
      {{ value.displayValue }}
    </div>
  </div>
</template>
<style scoped>
.pass {
  @apply text-green-500;
}
.average {
  @apply text-yellow-500;
}
.fail {
  @apply text-red-500;
}

.pass .icon {
  @apply bg-green-500 rounded-full;
}
.average .icon {
  @apply bg-yellow-500;
}
.fail .icon {
  @apply border-red-500;
  border-left: 0.25rem solid transparent;
  border-right: 0.25rem solid transparent;
  border-bottom: 0.5rem solid;
}
</style>
