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

const textColorClasses = computed(() => {
  const score = props.value.score
  if (score === null) return 'text-gray-500'
  if (score >= 0.9) return 'text-success'
  if (score >= 0.5) return 'text-warning'
  return 'text-error'
})

const iconClasses = computed(() => {
  const score = props.value.score
  if (score === null) return 'bg-gray-500 rounded-full'
  if (score >= 0.9) return 'bg-success rounded-full'
  if (score >= 0.5) return 'bg-warning'
  return 'border-red-700 dark:border-red-500 fail-icon'
})
</script>

<template>
  <div class="flex items-center text-mono font-mono" :class="[mark, textColorClasses]">
    <div class="w-2 h-2 mr-2" :class="[iconClasses, typeof value.displayValue !== 'undefined' && value.displayValue ? ['hidden', 'md:inline'] : []]" />
    <div v-if="typeof value.displayValue !== 'undefined'" class="text-base">
      {{ value.displayValue }}
    </div>
  </div>
</template>

<style scoped>
.fail-icon {
  border-left: 0.25rem solid transparent;
  border-right: 0.25rem solid transparent;
  border-bottom: 0.5rem solid;
}
</style>
