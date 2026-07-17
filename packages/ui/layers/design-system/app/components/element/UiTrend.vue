<script setup lang="ts">
import { computed } from 'vue'
import { clamp } from '../../utils/number'

const {
  value = 0,
  size = 'xs',
  iconOnly = false,
  format = 'number',
  showSign = false,
  inverted = false,
  colored = false,
  isNew = false,
  isLost = false,
  clamp: shouldClamp = true,
  precision = 1,
} = defineProps<{
  value?: number | string
  size?: keyof typeof sizes
  iconOnly?: boolean
  /** 'number' = raw value, 'percent' = appends % and auto-enables +/- sign */
  format?: 'number' | 'percent'
  /** Show +/- sign before value (auto-enabled for percent format) */
  showSign?: boolean
  /** Invert color logic — positive value shows red, negative shows green (e.g. position where lower is better) */
  inverted?: boolean
  /**
   * Trend color budget (DESIGN.md Composition): colored success/error trends
   * belong to the hero zone only. Default renders neutral (sign + value);
   * hero components (UiMetricsRow, UiMetricStat, hero cards) opt in.
   */
  colored?: boolean
  /** Show a "NEW" badge instead of trend value */
  isNew?: boolean
  /** Show a "LOST" badge instead of trend value */
  isLost?: boolean
  /** Clamp value to ±999 and show fun label. Set false to show full value. Default: true */
  clamp?: boolean
  /** Max decimal places for non-integer values. Use 'auto' to scale precision based on magnitude (1dp ≥10, 2dp ≥1, 3dp ≥0.1, 4dp smaller). Default: 1 */
  precision?: number | 'auto'
}>()

const sizes = {
  '2xs': 'text-mini',
  'xs': 'text-xs',
  'sm': 'text-sm',
  'md': 'text-base',
  'lg': 'text-lg',
  'xl': 'text-xl',
} as const

const numericValue = computed(() => typeof value === 'string' ? Number.parseFloat(value) : value)

// Auto-detect "lost" state: percent format and value <= -100 means went to zero
const autoLost = computed(() => !isNew && !isLost && format === 'percent' && numericValue.value <= -100)

const trend = computed<-1 | 0 | 1>(() => {
  const v = numericValue.value
  return v > 0
    ? 1
    : v < 0
      ? -1
      : 0
})

const trendColor = computed(() => {
  const t = trend.value
  if (t === 0 || !colored)
    return 'text-muted'
  const positive = inverted ? t === -1 : t === 1
  return positive ? 'text-success' : 'text-error'
})

const isClamped = computed(() => {
  if (!shouldClamp)
    return false
  const raw = typeof value === 'string' ? Number.parseFloat(value) : value
  return Math.abs(raw) > 999
})

function resolveDecimals(abs: number): number {
  if (precision !== 'auto')
    return precision
  if (abs >= 10)
    return 1
  if (abs >= 1)
    return 2
  if (abs >= 0.1)
    return 3
  return 4
}

function formatNum(n: number): string {
  if (n % 1 === 0)
    return String(n)
  const fixed = n.toFixed(resolveDecimals(Math.abs(n)))
  return precision === 'auto' ? fixed.replace(/\.?0+$/, '') || '0' : fixed
}

const fullValue = computed(() => {
  const raw = typeof value === 'string' ? Number.parseFloat(value) : value
  const signed = showSign || format === 'percent'
  const sign = signed && raw > 0 ? '+' : signed && raw < 0 ? '-' : ''
  const abs = Math.abs(raw)
  const suffix = format === 'percent' ? '%' : ''
  return `${sign}${formatNum(abs)}${suffix}`
})

const displayValue = computed(() => {
  const raw = typeof value === 'string' ? Number.parseFloat(value) : value
  const v = shouldClamp ? clamp(raw, -999, 999) : raw
  const abs = Math.abs(v)
  const signed = showSign || format === 'percent'
  const sign = signed && v > 0 ? '+' : signed && v < 0 ? '-' : ''
  const num = signed ? abs : v
  const suffix = format === 'percent' ? '%' : ''
  return `${sign}${formatNum(num)}${suffix}`
})

const trendIcon = computed(() =>
  trend.value === 1 ? 'arrow-up-right' : 'arrow-down-right',
)

const classes = computed(() => {
  return [
    trendColor.value,
    sizes[size as keyof typeof sizes],
  ]
})
</script>

<template>
  <!-- NEW badge mode -->
  <span v-if="isNew" data-ui="UiTrend" class="inline-flex items-center font-medium uppercase px-1.5 py-0.5 rounded bg-success/10 text-success" :class="sizes[size as keyof typeof sizes]">
    New
  </span>
  <!-- LOST badge mode (explicit or auto-detected from -100% change) -->
  <span v-else-if="isLost || autoLost" data-ui="UiTrend" class="inline-flex items-center font-medium uppercase px-1.5 py-0.5 rounded bg-error/10 text-error" :class="sizes[size as keyof typeof sizes]">
    Lost
  </span>
  <!-- Zero trend — show dash -->
  <span v-else-if="trend === 0" data-ui="UiTrend" class="text-dimmed" :class="sizes[size as keyof typeof sizes]" role="img" aria-label="No change">—</span>
  <!-- Clamped trend — fun tag with tooltip for real value -->
  <UiTooltip v-else-if="isClamped" :text="fullValue" trigger-as="child">
    <span
      data-ui="UiTrend"
      class="inline-flex items-center whitespace-nowrap leading-none font-semibold tracking-tight px-1.5 py-0.5 ml-1 rounded cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :class="[classes, colored ? (trend === 1 ? 'bg-success/10' : 'bg-error/10') : 'bg-muted']"
      role="img"
      :aria-label="fullValue"
      tabindex="0"
    >
      {{ trend === 1 ? '10x+' : 'oof' }}
    </span>
  </UiTooltip>
  <!-- Standard trend mode -->
  <span
    v-else
    data-ui="UiTrend"
    class="inline-flex gap-px items-center whitespace-nowrap leading-none tabular-nums font-semibold tracking-tight ml-1"
    :class="classes"
    :role="iconOnly ? 'img' : undefined"
    :aria-label="iconOnly ? `${trend === 1 ? 'Up' : 'Down'} ${fullValue}` : undefined"
  >
    <UiIcon
      v-if="iconOnly"
      :name="trendIcon"
      class="size-3 shrink-0"
      aria-hidden="true"
    />
    <template v-else>{{ displayValue }}</template>
  </span>
</template>
