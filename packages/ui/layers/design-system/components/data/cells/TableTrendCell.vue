<script setup lang="ts">
const {
  current,
  previous,
  inverted = false,
  size = '2xs',
  align = 'right',
} = defineProps<{
  current: number | null | undefined
  previous: number | null | undefined
  /** When true, a decrease is treated as positive (e.g. position ranking). */
  inverted?: boolean
  size?: '2xs' | 'xs' | 'sm'
  align?: 'left' | 'center' | 'right'
}>()

const percent = computed(() => {
  if (current == null || !previous)
    return null
  return calcTrendPercent(current, previous, inverted)
})

const alignClass = computed(() => align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start')
</script>

<template>
  <div class="flex items-center" :class="alignClass">
    <TableDash v-if="percent === null" />
    <UiTrend v-else :value="percent" format="percent" :inverted="inverted" :size="size" />
  </div>
</template>
