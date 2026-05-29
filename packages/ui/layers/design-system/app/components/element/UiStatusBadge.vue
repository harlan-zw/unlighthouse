<script setup lang="ts">
import type { SemanticStatus } from '../../composables/semanticColors'
import type { UiIcon } from '../../shared/ui-icons'
import { computed } from 'vue'
import { semanticColors } from '../../composables/semanticColors'

/**
 * UiStatusBadge — the semantic status entry.
 *
 * Default (sm) is a colored dot + neutral text: color rides the 6px dot, the
 * label stays `text-default`. This is the calm, stackable treatment for tables
 * and lists where many statuses appear at once — the expected state shouldn't
 * spend the page's color budget (see the color-budget ladder in the brand-kit).
 *
 *   - `prominent`  escalate to a tinted UiChip fill. Reserve for a SINGLE
 *                  prominent status (a card header, a hero callout), never in a
 *                  repeated row.
 *   - `size="md"`  icon container for empty / error states.
 */

const { status = 'neutral', icon, label, size = 'sm', prominent = false } = defineProps<{
  status?: SemanticStatus
  icon?: UiIcon
  label?: string
  /** 'sm' = inline indicator, 'md' = icon container (empty/error states) */
  size?: 'sm' | 'md'
  /** Escalate to a tinted chip fill. Reserve for a single prominent status. */
  prominent?: boolean
}>()

const colors = computed(() => semanticColors[status])
</script>

<template>
  <!-- md: icon container (empty / error states) -->
  <div v-if="size === 'md'" class="flex flex-col items-center gap-2">
    <div class="size-12 rounded-2xl flex items-center justify-center" :class="colors.bg">
      <UiIcon v-if="icon" :name="icon" class="size-6" :class="colors.text" />
    </div>
    <slot>
      <span v-if="label" class="text-sm font-medium">{{ label }}</span>
    </slot>
  </div>
  <!-- sm + prominent: tinted chip — singular emphasis only -->
  <UiChip
    v-else-if="prominent"
    purpose="status"
    :status="status"
    :icon="icon"
  >
    <slot>{{ label }}</slot>
  </UiChip>
  <!-- sm default: colored dot + neutral text — calm, stackable -->
  <span v-else class="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
    <span class="size-1.5 rounded-full shrink-0" :class="colors.dot" aria-hidden="true" />
    <span class="text-default"><slot>{{ label }}</slot></span>
  </span>
</template>
