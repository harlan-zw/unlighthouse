<script setup lang="ts">
const props = defineProps<{
  value: {
    score: number | null
    displayValue?: string
  }
}>()

const mark = computed(() => {
  if (props.value.score === null)
    return 'na'

  if (props.value.score >= 0.9)
    return 'pass'

  if (props.value.score >= 0.5)
    return 'average'

  return 'fail'
})
</script>

<template>
  <div class="flex items-center text-mono font-mono" :class="[mark]">
    <div class="icon w-2 h-2 mr-2" :class="typeof value.displayValue !== 'undefined' && value.displayValue ? ['hidden', 'md:inline'] : []" />
    <div v-if="typeof value.displayValue !== 'undefined'" class="text-base">
      {{ value.displayValue }}
    </div>
  </div>
</template>

<style scoped>
.pass {
  @apply dark:(text-green-500) text-green-700;
}
.average {
  @apply dark:(text-yellow-500) text-yellow-700;
}
.fail {
  @apply dark:(text-red-500) text-red-700;
}
.na {
  @apply text-gray-500;
}
.na .icon {
  @apply bg-gray-500 rounded-full;
}
.pass .icon {
  @apply bg-green-700 dark:bg-green-500 rounded-full;
}
.average .icon {
  @apply bg-yellow-700 dark:bg-yellow-500;
}
.fail .icon {
  @apply border-red-700 dark:border-red-500;
  border-left: 0.25rem solid transparent;
  border-right: 0.25rem solid transparent;
  border-bottom: 0.5rem solid;
}
</style>
