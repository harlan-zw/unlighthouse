<script setup lang="ts">
export interface NavLink {
  label: string
  to: string
  icon?: string
  iconClass?: string
  badge?: string
  badgeColor?: 'primary' | 'warning' | 'error'
  exact?: boolean
}

const { links } = defineProps<{
  links: NavLink[]
}>()

const route = useRoute()

function isActive(link: NavLink) {
  if (link.exact)
    return route.path === link.to
  return route.path === link.to || route.path.startsWith(`${link.to}/`)
}
</script>

<template>
  <nav class="space-y-0.5">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors"
      :class="isActive(link)
        ? 'bg-elevated text-highlighted'
        : 'text-muted hover:text-default hover:bg-elevated/60'"
    >
      <UiNavIcon v-if="link.icon" :icon="link.icon" />
      <span class="truncate">{{ link.label }}</span>
      <span
        v-if="link.badge"
        class="ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded-md"
        :class="link.badgeColor === 'warning'
          ? 'text-warning bg-warning/10'
          : link.badgeColor === 'error'
            ? 'text-error bg-error/10'
            : 'text-primary bg-primary/10'"
      >
        {{ link.badge }}
      </span>
    </NuxtLink>
  </nav>
</template>
