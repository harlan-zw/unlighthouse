<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'

// Compact "insight card" primitive for grids that gate per-analyzer. Renders
// the standard icon + title + description + headline + tagline layout, with
// a locked variant (dimmed, lock icon after title, swapped tagline) when
// the current data source can't satisfy the card.
//
// Use the default slot for the headline to keep dynamic formatting/colour
// rendering in the parent; fall back to `headline` for simple strings.

defineProps<{
  /** Lock icon + dim + swap tagline for the locked message. */
  locked?: boolean
  icon?: UiIcon
  title: string
  description?: string
  /** Shown as the large number when not using the default slot. */
  headline?: string
  headlineClass?: string
  /** Shown under the headline. Replaced by `lockedTagline` when locked. */
  tagline?: string
  lockedTagline?: string
  /** Deep-link target, hidden when locked. */
  ctaHref?: string
  ctaLabel?: string
}>()
</script>

<template>
  <div
    class="relative rounded-lg border border-default bg-default p-4 flex flex-col gap-2"
    :class="locked ? 'opacity-60' : ''"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2">
        <UiIcon v-if="icon" :name="icon" class="size-4 text-dimmed" />
        <h3 class="text-sm font-semibold tracking-tight text-default">
          {{ title }}
        </h3>
        <UiIcon
          v-if="locked"
          name="lock"
          class="size-3 text-dimmed"
          title="Not available for the current data source"
        />
      </div>
      <NuxtLink
        v-if="!locked && ctaHref"
        :to="ctaHref"
        class="text-mini text-muted hover:text-primary inline-flex items-center gap-1"
      >
        {{ ctaLabel ?? 'View' }} <UiIcon name="next" class="size-3" />
      </NuxtLink>
    </div>

    <p v-if="description" class="text-mini text-muted leading-snug">
      {{ description }}
    </p>

    <div class="flex items-baseline gap-2 mt-1">
      <div
        class="text-3xl font-semibold tabular-nums tracking-tight"
        :class="headlineClass"
      >
        <template v-if="locked">
          —
        </template>
        <slot v-else name="headline">
          {{ headline ?? '—' }}
        </slot>
      </div>
      <span class="text-mini text-dimmed">
        <template v-if="locked">
          {{ lockedTagline ?? 'Requires a higher plan.' }}
        </template>
        <slot v-else name="tagline">
          {{ tagline }}
        </slot>
      </span>
    </div>
  </div>
</template>
