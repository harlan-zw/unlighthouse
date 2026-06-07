<script lang="ts" setup>
import type { UiIcon } from '../../shared/ui-icons'

/**
 * Nav icon container used in sidebar navigation and status rows.
 * Default is primary-tinted. Semantic variants (success/warning/error/info)
 * use low-alpha skewed tints of the semantic color tokens.
 *
 * Renders through `UiIcon`, so it speaks the curated icon vocabulary
 * (semantic names like `chart`, `lock`) while still accepting raw `i-*` ids.
 */
type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'experimental'

const { icon, locked = false, loading = false, variant = 'default' } = defineProps<{
  icon: UiIcon
  locked?: boolean
  /** Swap the glyph for a spinner — e.g. a nav item whose data is syncing. */
  loading?: boolean
  variant?: Variant
}>()

const variantBoxClasses: Record<Variant, string> = {
  default: 'border bg-primary-300/10 border-primary-300/15 dark:bg-primary-900/10 dark:border-primary-950/15',
  success: 'border bg-success/5 border-success/20',
  warning: 'border bg-warning/5 border-warning/20',
  error: 'border bg-error/5 border-error/20',
  info: 'border bg-info/5 border-info/20',
  experimental: 'bg-[var(--ui-bg-elevated)]/60',
}

const variantIconClasses: Record<Variant, string> = {
  default: 'text-dimmed',
  success: 'text-success/80',
  warning: 'text-warning/80',
  error: 'text-error/80',
  info: 'text-info/80',
  experimental: 'text-dimmed',
}
</script>

<template>
  <div class="size-4.5 flex items-center justify-center rounded" :class="variantBoxClasses[variant]">
    <UiIcon
      :name="loading ? 'i-lucide-loader-circle' : locked ? 'lock' : icon"
      class="size-2.5 shrink-0"
      :class="[variantIconClasses[variant], { 'animate-spin': loading }]"
      aria-hidden="true"
    />
  </div>
</template>
