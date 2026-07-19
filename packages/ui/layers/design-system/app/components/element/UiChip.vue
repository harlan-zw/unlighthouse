<script setup lang="ts">
import type { SemanticStatus } from '../../composables/semanticColors'
import type { UiIcon } from '../../shared/ui-icons'
import { computed } from 'vue'
import { semanticColors } from '../../composables/semanticColors'

/**
 * UiChip — the single chip/badge primitive, driven by a semantic `purpose`
 * prop the same way UiButton is driven by `purpose`. There is no raw
 * `variant`/`color` knob: each purpose resolves to a fixed treatment so chip
 * intent reads consistently everywhere.
 *
 *   - `status`  semantic state (health, sync, validation). Colour comes from
 *               the data-bound `status` prop, rendered as a subtle tint.
 *   - `count`   quantity / category metadata — neutral outline.
 *   - `tag`     low-emphasis label / removable filter — muted fill.
 *   - `accent`  standout marker (e.g. NEW) — inverted neutral.
 *   - `brand`   deliberate brand marker (e.g. "Pro", "Most popular") — subtle
 *               violet. Reserved for genuine brand markers; do not spray (it
 *               spends the 60/30/10 accent budget).
 *
 * Maps onto UiButton's purposes: accent↔cta, count↔secondary, tag↔quiet,
 * status='error'↔danger.
 */

const {
  purpose = 'status',
  status = 'neutral',
  size = 'xs',
  icon,
  removable = false,
  mono = false,
  tabular = false,
  label,
} = defineProps<{
  purpose?: 'status' | 'count' | 'tag' | 'accent' | 'brand'
  /** Semantic status — only honoured when purpose='status'. */
  status?: SemanticStatus
  size?: 'xs' | 'sm'
  icon?: UiIcon
  removable?: boolean
  mono?: boolean
  tabular?: boolean
  /** Chip text, used to give the remove button a unique accessible name
   *  ("Remove <label>"). Falls back to "Remove" when omitted. */
  label?: string
}>()

const emit = defineEmits<{
  remove: []
}>()

const sizeClass = {
  xs: 'text-mini px-2 py-0.5 rounded-md gap-1',
  sm: 'text-xs px-2.5 py-1 rounded-md gap-1.5',
} as const

const colorClass = computed(() => {
  switch (purpose) {
    case 'count':
      return 'border border-default bg-default text-muted'
    case 'tag':
      return 'bg-accented text-muted'
    case 'accent':
      return 'bg-inverted text-inverted'
    case 'brand':
      return 'bg-primary/10 text-primary'
    case 'status':
    default: {
      const c = semanticColors[status]
      const text = {
        success: 'text-[var(--ui-color-success-800)] dark:text-success',
        error: 'text-[var(--ui-color-error-700)] dark:text-error',
        warning: 'text-[var(--ui-color-warning-800)] dark:text-warning',
        info: 'text-[var(--ui-color-info-700)] dark:text-info',
        neutral: c.text,
      }[status]
      return `${c.bg} ${text}`
    }
  }
})
</script>

<template>
  <span
    class="inline-flex items-center font-medium whitespace-nowrap"
    :class="[
      sizeClass[size],
      colorClass,
      mono && 'font-mono',
      tabular && 'tabular-nums',
    ]"
  >
    <UiIcon v-if="icon" :name="icon" class="size-3 shrink-0" />
    <slot />
    <button
      v-if="removable"
      type="button"
      class="-mr-1 inline-flex size-6 items-center justify-center rounded-sm opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :aria-label="label ? `Remove ${label}` : 'Remove'"
      @click.stop="emit('remove')"
    >
      <UiIcon name="close" class="size-3" />
    </button>
  </span>
</template>
