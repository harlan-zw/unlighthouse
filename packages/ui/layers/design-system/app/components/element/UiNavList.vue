<script setup lang="ts" generic="T extends UiNavLink">
import type { VNodeChild } from 'vue'
import type { UiNavLink } from '../../shared/nav'
import { useRoute } from 'nuxt/app'

const { links, activeMode = 'exact', label, variant = 'default', tone = 'muted' } = defineProps<{
  links: T[]
  /** Sidebar rows use plain icons. Release labels belong in the page header. */
  variant?: 'default' | 'sidebar'
  tone?: 'default' | 'muted'
  activeMode?: 'exact' | 'prefix'
  /**
   * Accessible name for this `<nav>` landmark. Pass a distinct value when more
   * than one nav list renders on a page (e.g. grouped sidebars) so the landmarks
   * stay unique for screen readers.
   */
  label?: string
}>()

defineSlots<{
  /** Custom leading visual per item (e.g. a favicon). Replaces `UiNavIcon`. */
  icon?: (props: { link: T, active: boolean }) => VNodeChild
  /** Trailing per-row action (e.g. a hover menu). Rendered as a sibling of the
   *  link, not nested inside the anchor, so interactive triggers stay valid. */
  action?: (props: { link: T }) => VNodeChild
}>()

const route = useRoute()

function isActive(link: T) {
  if (link.active)
    return link.active(route.path)
  if (activeMode === 'prefix')
    return route.path === link.to || route.path.startsWith(`${link.to}/`)
  return route.path === link.to
}
</script>

<template>
  <nav class="space-y-0.5" :aria-label="label">
    <div
      v-for="link in links"
      :key="link.to"
      class="relative group/navitem"
    >
      <NuxtLink
        :to="link.disabled ? undefined : link.to"
        :prefetch="link.disabled ? undefined : link.prefetch"
        :aria-disabled="link.disabled || undefined"
        :aria-current="isActive(link) && !link.disabled ? 'page' : undefined"
        :tabindex="link.disabled ? -1 : undefined"
        class="flex items-center gap-1.5 px-1 py-1 min-h-11 lg:min-h-0 rounded text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :class="[
          link.disabled
            ? 'text-dimmed cursor-not-allowed'
            : isActive(link)
              ? 'bg-elevated text-highlighted'
              : link.textTone === 'highlighted'
                ? 'text-highlighted hover:text-highlighted hover:bg-elevated'
                : tone === 'default'
                  ? 'text-default hover:text-highlighted hover:bg-elevated'
                  : 'text-muted hover:text-default hover:bg-elevated',
          variant === 'sidebar' && !link.disabled && !isActive(link) && (tone === 'default' || link.textTone === 'highlighted')
            ? 'dark:text-toned dark:hover:text-highlighted'
            : undefined,
        ]"
        :style="isActive(link) && !link.disabled ? { boxShadow: 'var(--elevation-raised)', backgroundImage: 'var(--surface-raised)' } : undefined"
        :title="link.title"
      >
        <slot v-if="$slots.icon" name="icon" :link="link" :active="isActive(link)" />
        <UiIcon
          v-else-if="link.icon && variant === 'sidebar'"
          :name="link.icon"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <UiNavIcon
          v-else-if="link.icon"
          :icon="link.icon"
          :active="isActive(link)"
        />
        <span class="min-w-0 truncate">{{ link.label }}</span>
        <span
          v-if="link.badge"
          class="ml-auto text-mini font-medium px-1.5 py-0.5 rounded-md"
          :class="link.badgeColor === 'warning'
            ? 'text-warning bg-warning/10'
            : link.badgeColor === 'neutral'
              ? 'text-muted bg-elevated ring-1 ring-default'
              : 'text-primary bg-primary/10'"
        >
          {{ link.badge }}
        </span>
        <!--
          A row whose feature is not connected yet owes the user a chore, not an
          alert. It renders as an unfilled outline chip carrying the verb, so it
          names the action without a tooltip and stays quieter than the filled
          `badge` above (a real worklist count) sitting in the same slot.
        -->
        <UiTooltip
          v-else-if="link.setup"
          :text="link.setup.tooltip"
        >
          <span
            class="ml-auto shrink-0 text-mini font-medium px-1.5 py-px rounded border border-dashed transition-colors"
            :class="link.setup.tone === 'warning'
              ? 'text-warning border-warning/30 group-hover/navitem:border-warning/50'
              : 'text-muted border-default group-hover/navitem:text-default group-hover/navitem:border-accented'"
          >
            <!--
              The verb alone is ambiguous out of row context, so the accessible
              name carries the same full state the tooltip shows. `text-dimmed`
              is banned here: this chip is an affordance, not tertiary metadata,
              and it fails AA in dark mode.
            -->
            <span aria-hidden="true">{{ link.setup.verb }}</span>
            <span class="sr-only">{{ link.setup.tooltip }}</span>
          </span>
        </UiTooltip>
        <UiTooltip
          v-else-if="link.pending"
          :text="link.pendingTooltip || 'Waiting for data'"
        >
          <span
            class="ml-auto flex items-center"
            role="img"
            :aria-label="link.pendingTooltip || 'Waiting for data'"
          >
            <span class="size-1.5 rounded-full bg-current text-warning motion-safe:animate-pulse" aria-hidden="true" />
          </span>
        </UiTooltip>
        <!--
          Stability is a word, not a glyph: a flask beside three rows told the
          reader nothing without hovering each one. Same dashed outline chip
          as `setup` above, in the muted tone, so the sidebar carries one chip
          grammar (a verb to act on, or a tier to know about).
        -->
        <UiTooltip
          v-else-if="link.stability && variant !== 'sidebar'"
          :text="link.stability.tooltip"
        >
          <span class="ml-auto shrink-0 text-mini font-medium px-1.5 py-px rounded border border-dashed border-default text-muted transition-colors group-hover/navitem:text-default group-hover/navitem:border-accented">
            {{ link.stability.tooltip }}
          </span>
        </UiTooltip>
      </NuxtLink>
      <div
        v-if="$slots.action"
        class="absolute right-1 top-1/2 -translate-y-1/2"
      >
        <slot name="action" :link="link" />
      </div>
    </div>
  </nav>
</template>
