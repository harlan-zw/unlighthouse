<script setup lang="ts">
import type { NavLink } from '~/components/NavList.vue'
import { siteHostname, useSites } from '~/composables/sites'

const route = useRoute()
const { sites, groups, sitesByGroup } = useSites()

const topLinks: NavLink[] = [
  { label: 'Dashboard', to: '/', icon: 'i-heroicons-squares-2x2', exact: true },
  { label: 'Integrations', to: '/integrations', icon: 'i-heroicons-puzzle-piece' },
]

const collapsedGroups = useState<Set<string>>('sidebar-collapsed-groups', () => new Set())
function isGroupCollapsed(id: string) {
  return collapsedGroups.value.has(id)
}
function toggleGroup(id: string) {
  const next = new Set(collapsedGroups.value)
  next.has(id) ? next.delete(id) : next.add(id)
  collapsedGroups.value = next
}

const ungrouped = computed(() => sitesByGroup.value.get(null) || [])
</script>

<template>
  <DashboardShell logo-to="/">
    <template #sidebar="{ closeNav }">
      <NavList :links="topLinks" />

      <div>
        <div class="flex items-center justify-between mb-2 px-1">
          <span class="text-[11px] font-semibold text-dimmed uppercase tracking-widest px-1">
            Sites
          </span>
          <NuxtLink
            to="/sites/add"
            class="size-5 flex items-center justify-center rounded text-dimmed hover:text-default hover:bg-elevated transition-colors"
            title="Add site"
            @click="closeNav()"
          >
            <UIcon name="i-heroicons-plus" class="size-3" aria-hidden="true" />
          </NuxtLink>
        </div>

        <div v-if="sites.length" class="flex flex-col gap-3">
          <div v-for="group in groups" v-show="sitesByGroup.get(group.id)?.length" :key="group.id">
            <button
              type="button"
              class="flex items-center gap-1 w-full px-2 mb-1 text-xs text-muted font-semibold hover:text-default transition-colors"
              :aria-expanded="!isGroupCollapsed(group.id)"
              @click="toggleGroup(group.id)"
            >
              <UIcon
                name="i-heroicons-chevron-right"
                class="size-3 text-dimmed transition-transform duration-200"
                :class="{ 'rotate-90': !isGroupCollapsed(group.id) }"
                aria-hidden="true"
              />
              <span class="truncate">{{ group.name }}</span>
            </button>
            <nav v-show="!isGroupCollapsed(group.id)" class="space-y-0.5 bg-muted/40 rounded p-1">
              <NuxtLink
                v-for="site in sitesByGroup.get(group.id) || []"
                :key="site.id"
                :to="`/sites/${site.id}`"
                class="flex items-center gap-1.5 px-1.5 py-1 rounded text-sm transition-colors"
                :class="route.path.startsWith(`/sites/${site.id}`)
                  ? 'bg-elevated text-highlighted'
                  : 'text-muted hover:text-default hover:bg-elevated/70'"
                @click="closeNav()"
              >
                <SiteFavicon :url="site.url" :alt="site.name" class="w-3.5 h-3.5" />
                <span class="truncate text-[13px]">{{ site.name }}</span>
              </NuxtLink>
            </nav>
          </div>

          <div v-if="ungrouped.length">
            <button
              type="button"
              class="flex items-center gap-1 w-full px-2 mb-1 text-xs text-muted font-semibold hover:text-default transition-colors"
              :aria-expanded="!isGroupCollapsed('__ungrouped')"
              @click="toggleGroup('__ungrouped')"
            >
              <UIcon
                name="i-heroicons-chevron-right"
                class="size-3 text-dimmed transition-transform duration-200"
                :class="{ 'rotate-90': !isGroupCollapsed('__ungrouped') }"
                aria-hidden="true"
              />
              <span class="truncate">Ungrouped</span>
            </button>
            <nav v-show="!isGroupCollapsed('__ungrouped')" class="space-y-0.5 bg-muted/40 rounded p-1">
              <NuxtLink
                v-for="site in ungrouped"
                :key="site.id"
                :to="`/sites/${site.id}`"
                class="flex items-center gap-1.5 px-1.5 py-1 rounded text-sm transition-colors"
                :class="route.path.startsWith(`/sites/${site.id}`)
                  ? 'bg-elevated text-highlighted'
                  : 'text-muted hover:text-default hover:bg-elevated/70'"
                @click="closeNav()"
              >
                <SiteFavicon :url="site.url" :alt="site.name" class="w-3.5 h-3.5" />
                <span class="truncate text-[13px]">{{ site.name }}</span>
              </NuxtLink>
            </nav>
          </div>
        </div>

        <NuxtLink
          v-else
          to="/sites/add"
          class="flex items-center gap-1.5 px-2 py-2 rounded border border-dashed border-default text-sm text-muted hover:text-default hover:border-default transition-colors"
          @click="closeNav()"
        >
          <UIcon name="i-heroicons-plus" class="size-3.5 shrink-0" aria-hidden="true" />
          Add your first site
        </NuxtLink>
      </div>
    </template>

    <slot />
  </DashboardShell>
</template>
