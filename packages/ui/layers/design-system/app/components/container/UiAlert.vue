<script setup lang="ts">
import type { SemanticStatus } from '../../composables/semanticColors'
import type { UiIcon } from '../../shared/ui-icons'
import { m, useReducedMotion } from 'motion-v'
import { computed } from 'vue'
import { semanticColors } from '../../composables/semanticColors'
import { entrancePresets, entranceProps } from '../../shared/motion'

const { status = 'info', icon, title } = defineProps<{
  /** Semantic status — drives the accent icon + bar + corner bloom (surface
   *  stays neutral for every status). Shared name across the status family
   *  (UiChip, UiStatusBadge). */
  status?: SemanticStatus
  /** Icon name (Lucide/Carbon) */
  icon?: UiIcon
  /** Alert title */
  title?: string
  /** Alert description text */
  description?: string
  /** Show close/dismiss button */
  dismissible?: boolean
}>()

const emit = defineEmits<{
  dismiss: []
}>()

// All alerts use a neutral surface; the semantic accent rides the icon + the
// top bar + corner bloom only. A red/amber/green fill dominates the page —
// especially when alerts stack — and spends color on the surface instead of
// the signal. Keep the colour where it carries meaning (the icon), not the
// whole banner. (Color-budget ladder — see brand-kit /status.)
const colors = computed(() => ({
  ...semanticColors[status],
  bg: 'bg-elevated/50',
  border: 'border-default',
}))

const defaultIcons: Record<SemanticStatus, string> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  success: 'success',
  neutral: 'circle-dash',
}

const resolvedIcon = computed(() => icon || defaultIcons[status])

const isUrgent = computed(() => status === 'error' || status === 'warning')
const dismissLabel = computed(() => title ? `Dismiss alert: ${title}` : 'Dismiss alert')

const reduced = useReducedMotion()
</script>

<template>
  <!-- motion-v fadeUp entrance — animates in on mount, reduced-motion aware. -->
  <m.div
    class="ui-alert group relative overflow-hidden rounded-xl border"
    :class="[colors.bg, colors.border]"
    :role="isUrgent ? 'alert' : 'status'"
    :aria-live="isUrgent ? 'assertive' : 'polite'"
    v-bind="entranceProps(entrancePresets.fadeUp, reduced)"
  >
    <!-- Top-left corner bloom — faint radial light source, kept whisper-quiet
         so the semantic accent reads as a hint, not a wash. -->
    <div
      class="pointer-events-none absolute left-0 top-0 size-14 rounded-full opacity-[0.15] blur-xl"
      :class="colors.dot"
      style="transform: translate(-55%, -55%);"
      aria-hidden="true"
    />

    <!-- Gradient fade accent bar — top edge, crisp at left, fades out.
         Runs along the top so the semantic accent matches the top-lit
         direction of the --surface-bevel fill rather than fighting it. -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-px opacity-[0.35]"
      :class="colors.dot"
      style="mask-image: linear-gradient(to right, black 0%, black 20%, transparent 80%); -webkit-mask-image: linear-gradient(to right, black 0%, black 20%, transparent 80%);"
      aria-hidden="true"
    />

    <div class="flex items-start gap-3 px-4 py-3">
      <UiIcon :name="resolvedIcon" class="mt-0.5 size-4 shrink-0" :class="colors.text" aria-hidden="true" />

      <!-- Content -->
      <div class="min-w-0 flex-1 flex items-start gap-4">
        <div class="min-w-0 flex-1 text-xs">
          <p v-if="title" class="font-medium text-default">
            {{ title }}
          </p>
          <p v-if="description" class="text-muted" :class="title ? 'mt-0.5' : ''">
            {{ description }}
          </p>
          <slot />
        </div>

        <!-- Inline action -->
        <slot name="action" />
      </div>

      <!-- Dismiss -->
      <UiButton
        v-if="dismissible"
        class="cursor-pointer"
        :aria-label="dismissLabel"
        purpose="quiet"
        size="xs"
        @click="emit('dismiss')"
      >
        <UiIcon name="close" class="size-3" aria-hidden="true" />
      </UiButton>
    </div>

    <!-- Progress bar (optional) -->
    <slot name="progress" />
  </m.div>
</template>
