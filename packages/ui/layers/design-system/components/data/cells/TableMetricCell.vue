<script setup lang="ts">
type Status = 'good' | 'ni' | 'poor' | 'neutral'

const {
  value,
  display,
  status = 'neutral',
  muted = false,
  align = 'right',
} = defineProps<{
  value: number | null | undefined
  /** Pre-formatted display string. If omitted, value is rendered as-is via String(). */
  display?: string | null
  /** Optional status colour token (e.g. CWV good/needs-improvement/poor). */
  status?: Status
  /** Render in muted secondary tone (e.g. impressions vs primary clicks). */
  muted?: boolean
  align?: 'left' | 'center' | 'right'
}>()

const isNullish = computed(() => value == null || value === 0 || display === null)

const statusClass: Record<Status, string> = {
  good: 'text-success',
  ni: 'text-warning',
  poor: 'text-error',
  neutral: '',
}

const statusLabel: Record<Status, string | undefined> = {
  good: 'Good',
  ni: 'Needs improvement',
  poor: 'Poor',
  neutral: undefined,
}

const alignClass = computed(() => align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start')

const ariaLabel = computed(() => {
  const label = statusLabel[status]
  if (!label || !display)
    return undefined
  return `${display}, ${label}`
})
</script>

<template>
  <div
    class="flex items-center gap-2"
    :class="[$slots.trend ? 'flex-col items-stretch gap-1' : '', alignClass]"
  >
    <TableDash v-if="isNullish" />
    <span
      v-else
      class="font-mono text-sm tabular-nums"
      :class="[
        statusClass[status],
        muted && status === 'neutral' ? 'text-muted' : 'font-medium',
      ]"
      :aria-label="ariaLabel"
    >{{ display ?? String(value) }}</span>
    <slot v-if="!isNullish" name="trend" />
    <slot v-if="!isNullish" name="after" />
  </div>
</template>
