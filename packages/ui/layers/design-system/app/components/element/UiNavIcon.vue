<script lang="ts" setup>
import type { UiIcon } from '../../shared/ui-icons'
import { computed } from 'vue'

/**
 * Nav icon container used in sidebar navigation and status rows.
 * Default is primary-tinted. Semantic variants (success/warning/error/info)
 * use low-alpha skewed tints of the semantic color tokens.
 *
 * The `default` variant is alive: idle it stays restrained (dimmed glyph,
 * faint tint), then leans into the brand color as a pop on hover (reacts to a
 * `group/navitem` ancestor) and on `active`. The glyph springs up a touch and
 * the box lifts, so the icon reads as the focal point of its row rather than a
 * flat chip. Semantic variants are static status tints and don't react.
 *
 * Renders through `UiIcon`, so it speaks the curated icon vocabulary
 * (semantic names like `chart`, `lock`) while still accepting raw `i-*` ids.
 *
 * `neutral` is the monochrome identity treatment: a flat neutral box + muted
 * glyph, no brand tint and no hover pop. Use it when the icon is resting
 * identity (e.g. a trigger-kind glyph) and the colour budget belongs to the
 * row's status (a dot/badge), not the icon. Differentiate kinds by glyph shape,
 * never by colour.
 */
type Variant = 'default' | 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'experimental'

const { icon, locked = false, loading = false, active = false, variant = 'default', size = 'md' } = defineProps<{
  icon: UiIcon
  locked?: boolean
  /** Swap the glyph for a spinner — e.g. a nav item whose data is syncing. */
  loading?: boolean
  /** Marks the icon's row as active — deepens the tint, lifts the glyph to primary, adds a soft halo. */
  active?: boolean
  variant?: Variant
  /** `md` (size-6 — nav/status rows) · `sm` (size-5) · `xs` (size-4 — dense list rows). */
  size?: 'xs' | 'sm' | 'md'
}>()

const boxSize = size === 'xs' ? 'size-4' : size === 'sm' ? 'size-5' : 'size-6'
const glyphSize = size === 'xs' ? 'size-2.5' : size === 'sm' ? 'size-3' : 'size-3.5'

const variantBoxClasses: Record<Variant, string> = {
  neutral: 'border border-default bg-elevated',
  success: 'border bg-success/5 border-success/20',
  warning: 'border bg-warning/5 border-warning/20',
  error: 'border bg-error/5 border-error/20',
  info: 'border bg-info/5 border-info/20',
  experimental: 'bg-[var(--ui-bg-elevated)]/60',
} as Record<Variant, string>

const variantIconClasses: Record<Variant, string> = {
  neutral: 'text-muted',
  success: 'text-success/80',
  warning: 'text-warning/80',
  error: 'text-error/80',
  info: 'text-info/80',
  experimental: 'text-dimmed',
} as Record<Variant, string>

// The default variant is state-driven; precedence is active > hover > idle so
// nothing fights over `!important`. Hover is CSS-only (group/navitem ancestor).
const boxClass = computed(() => {
  if (variant !== 'default')
    return variantBoxClasses[variant]
  if (active)
    return 'border bg-gradient-to-b from-primary-300/30 to-primary-300/12 border-primary/35 ring-2 ring-primary/15 dark:from-primary-900/40 dark:to-primary-900/15'
  return 'border bg-gradient-to-b from-primary-300/15 to-primary-300/5 border-primary-300/15 dark:from-primary-900/20 dark:to-primary-900/5 dark:border-primary-950/15 group-hover/navitem:-translate-y-px group-hover/navitem:from-primary-300/25 group-hover/navitem:to-primary-300/10 group-hover/navitem:border-primary-300/30 dark:group-hover/navitem:from-primary-900/30 dark:group-hover/navitem:to-primary-900/10'
})

const iconClass = computed(() => {
  if (variant !== 'default')
    return variantIconClasses[variant]
  if (active)
    return 'text-primary scale-110'
  return 'text-dimmed group-hover/navitem:text-primary group-hover/navitem:scale-115'
})
</script>

<template>
  <div
    class="flex items-center justify-center rounded-md transition-[transform,background-color,border-color,box-shadow] duration-200 ease-[var(--ease-spring)]"
    :class="[boxSize, boxClass]"
  >
    <UiIcon
      :name="loading ? 'loading' : locked ? 'lock' : icon"
      class="shrink-0 transition-[transform,color] duration-200 ease-[var(--ease-spring)]"
      :class="[glyphSize, iconClass, { 'animate-spin': loading }]"
      aria-hidden="true"
    />
  </div>
</template>
