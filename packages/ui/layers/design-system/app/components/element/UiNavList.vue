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
  active?: (path: string) => boolean
}

const { links, activeMode = 'exact' } = defineProps<{
  links: T[]
  activeMode?: 'exact' | 'prefix'
}>()

defineSlots<{
  /** Custom leading visual per item (e.g. a favicon). Replaces `UiNavIcon`. */
  icon?: (props: { link: T }) => any
  /** Trailing per-row action (e.g. a hover menu). Rendered as a sibling of the
   *  link, not nested inside the anchor, so interactive triggers stay valid. */
  action?: (props: { link: T }) => any
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
  <nav class="space-y-0.5">
    <div
      v-for="link in links"
      :key="link.to"
      class="relative group/navitem"
    >
      <NuxtLink
        :to="link.disabled ? undefined : link.to"
        :aria-disabled="link.disabled || undefined"
        :tabindex="link.disabled ? -1 : undefined"
        class="flex items-center gap-1.5 px-1 py-1 rounded text-sm transition-colors"
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
        <slot v-if="$slots.icon" name="icon" :link="link" />
        <UiNavIcon
          v-else-if="link.icon"
          :icon="link.icon"
        />
        <span class="truncate">{{ link.label }}</span>
        <span
          v-if="link.badge"
          class="ml-auto text-mini font-medium px-1.5 py-0.5 rounded-md"
          :class="link.badgeColor === 'warning'
            ? `${semanticColors.warning.text} ${semanticColors.warning.bg}`
            : 'text-primary bg-primary/10'"
        >
          {{ link.badge }}
        </span>
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
