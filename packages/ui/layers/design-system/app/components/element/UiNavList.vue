<script setup lang="ts" generic="T extends UiNavLink">
import { useRoute } from 'nuxt/app'

/** Trailing stability glyph descriptor (structurally matches pro-saas `NavStability`). */
export interface UiNavStability {
  icon: string
  tooltip: string
}

export interface UiNavLink {
  label: string
  to: string
  icon?: string
  disabled?: boolean
  title?: string
  badge?: string
  badgeColor?: 'primary' | 'warning'
  stability?: UiNavStability | null
  /** Trailing "waiting" dot — the surface exists but a prerequisite (e.g. an
   *  integration connection or first sync) isn't met yet. */
  pending?: boolean
  pendingTooltip?: string
  active?: (path: string) => boolean
}

const { links, activeMode = 'exact', label } = defineProps<{
  links: T[]
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
  icon?: (props: { link: T, active: boolean }) => unknown
  /** Trailing per-row action (e.g. a hover menu). Rendered as a sibling of the
   *  link, not nested inside the anchor, so interactive triggers stay valid. */
  action?: (props: { link: T }) => unknown
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
        :aria-disabled="link.disabled || undefined"
        :tabindex="link.disabled ? -1 : undefined"
        class="flex items-center gap-1.5 px-1 py-1 min-h-11 lg:min-h-0 rounded text-sm transition-colors"
        :class="[
          link.disabled
            ? 'text-dimmed cursor-not-allowed'
            : isActive(link)
              ? 'bg-elevated text-highlighted'
              : 'text-muted hover:text-default hover:bg-elevated',
        ]"
        :style="isActive(link) && !link.disabled ? { boxShadow: 'var(--elevation-raised)', backgroundImage: 'var(--surface-raised)' } : undefined"
        :title="link.title"
      >
        <slot v-if="$slots.icon" name="icon" :link="link" :active="isActive(link)" />
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
            : 'text-primary bg-primary/10'"
        >
          {{ link.badge }}
        </span>
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
        <UiTooltip
          v-else-if="link.stability"
          :text="link.stability.tooltip"
        >
          <div
            class="ml-auto opacity-45 group-hover/navitem:opacity-100 transition-opacity"
            role="img"
            :aria-label="link.stability.tooltip"
          >
            <UiNavIcon :icon="link.stability.icon" variant="experimental" />
          </div>
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
