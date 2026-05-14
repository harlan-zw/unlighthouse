<script setup lang="ts">
const {
  score,
  label,
  bgClass = '',
} = defineProps<{
  score: number | null | undefined
  /** Metric name (e.g. "Performance", "LCP"). Used for the aria-label. */
  label?: string
  /** Background class derived from caller's threshold logic (e.g. scoreBgClass()). */
  bgClass?: string
}>()

const status = computed<'good' | 'ni' | 'poor' | 'neutral'>(() => {
  if (score == null)
    return 'neutral'
  if (score >= 90)
    return 'good'
  if (score >= 50)
    return 'ni'
  return 'poor'
})

const statusWord: Record<typeof status['value'], string> = {
  good: 'Good',
  ni: 'Needs improvement',
  poor: 'Poor',
  neutral: 'No data',
}

const ariaLabel = computed(() => {
  const value = score == null ? 'No data' : String(score)
  const word = statusWord[status.value]
  return label ? `${label} ${value}, ${word}` : `${value}, ${word}`
})
</script>

<template>
  <div
    class="inline-flex items-center justify-center size-8 rounded-md text-[11px] font-bold font-mono tabular-nums"
    :class="bgClass"
    role="img"
    :aria-label="ariaLabel"
  >
    <span aria-hidden="true">{{ score ?? '—' }}</span>
  </div>
</template>
