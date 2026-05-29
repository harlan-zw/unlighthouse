<script setup lang="ts">
import type { UiNavLink } from '#design-system/app/components/element/UiNavList.vue'

const colorMode = useColorMode()

const sections = [
  { heading: 'Foundation', items: [
    { to: '/', label: 'Overview', icon: 'i-carbon-star', exact: true },
    { to: '/colors', label: 'Colors', icon: 'i-carbon-color-palette' },
    { to: '/typography', label: 'Typography', icon: 'i-carbon-text-creation' },
    { to: '/depth', label: 'Depth & elevation', icon: 'i-carbon-layers' },
    { to: '/motion', label: 'Motion', icon: 'i-carbon-flash' },
    { to: '/utilities', label: 'Utilities', icon: 'i-carbon-magic-wand' },
  ] },
  { heading: 'Components', items: [
    { to: '/buttons', label: 'Buttons & motion', icon: 'i-carbon-cursor-1' },
    { to: '/forms', label: 'Forms', icon: 'i-carbon-edit' },
    { to: '/status', label: 'Status & indicators', icon: 'i-carbon-circle-packing' },
    { to: '/skeleton', label: 'Skeleton', icon: 'i-carbon-skill-level-basic' },
    { to: '/cards', label: 'Cards & surfaces', icon: 'i-carbon-template' },
    { to: '/elements', label: 'Elements', icon: 'i-carbon-cube' },
    { to: '/tooltip', label: 'Tooltip', icon: 'i-carbon-information' },
    { to: '/popover', label: 'Popover & menus', icon: 'i-carbon-menu' },
  ] },
  { heading: 'Data', items: [
    { to: '/data-cells', label: 'Table cells', icon: 'i-carbon-grid' },
    { to: '/tables', label: 'Data tables', icon: 'i-carbon-table' },
    { to: '/filters', label: 'Filtering', icon: 'i-carbon-filter' },
    { to: '/charts', label: 'Charts', icon: 'i-carbon-chart-line' },
  ] },
]

const navSections = computed(() => sections.map(group => ({
  heading: group.heading,
  links: group.items.map<UiNavLink>(item => ({
    label: item.label,
    to: item.to,
    icon: item.icon,
    ...(item.exact ? { active: (path: string) => path === item.to } : {}),
  })),
})))
</script>

<template>
  <AppShell :sidebar-width="56" content-class="">
    <template #brand>
      <div class="space-y-3">
        <div class="space-y-1 px-1">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-primary-500 animate-pulse" />
            <span class="text-[10px] uppercase tracking-[0.2em] text-muted font-medium">Brand Kit</span>
          </div>
          <NuxtLink to="/" class="text-base font-bold tracking-tight text-highlighted block leading-tight">
            Unlighthouse Design System
          </NuxtLink>
        </div>
        <ClientOnly>
          <UiButton
            :icon="colorMode.value === 'dark' ? 'i-carbon-sun' : 'i-carbon-moon'"
            purpose="secondary"
            size="xs"
            block
            @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
          >
            {{ colorMode.value === 'dark' ? 'Light mode' : 'Dark mode' }}
          </UiButton>
          <template #fallback>
            <div class="h-7 rounded-md bg-elevated/40" />
          </template>
        </ClientOnly>
      </div>
    </template>

    <template #sidebar>
      <div v-for="group in navSections" :key="group.heading">
        <div class="text-[10px] uppercase tracking-wider text-dimmed font-semibold mb-1 px-1">
          {{ group.heading }}
        </div>
        <UiNavList :links="group.links" active-mode="prefix" />
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between text-xs text-muted">
        <span>v4.x</span>
        <NuxtLink to="/" class="hover:text-default transition-colors">
          Back to site
        </NuxtLink>
      </div>
    </template>

    <div class="pro-container py-8 space-y-10">
      <slot />
    </div>
  </AppShell>
</template>
