<script setup lang="ts">
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

// The persistent left rail: top-level nav plus a live list of registered
// sites, each linking to its /sites/{slug} detail page.
const route = useRoute()
const api = useApi()

// Shared key with the site page so the list loads once and stays in sync.
const { data: sitesData } = useAsyncData(
  'sidebar-sites',
  () => api['sites.list']({}).catch(() => ({ sites: [] as Array<{ id: string, name: string, url: string, group: string | null }> })),
)
const sites = computed(() => sitesData.value?.sites ?? [])
const activeSlug = computed(() => route.params.siteId as string | undefined)

interface NavItem {
  label: string
  to: string
  icon: string
  match: (path: string) => boolean
}

const nav: NavItem[] = [
  { label: 'Home', to: '/', icon: 'lucide:layout-dashboard', match: p => p === '/' },
  { label: 'Sites', to: '/sites', icon: 'lucide:globe', match: p => p === '/sites' || p.startsWith('/sites/') },
  { label: 'History', to: '/history', icon: 'lucide:history', match: p => p.startsWith('/history') },
  { label: 'New Scan', to: '/scan/new', icon: 'lucide:plus', match: p => p === '/scan/new' },
]
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child tooltip="Unlighthouse">
            <NuxtLink to="/">
              <div class="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon name="lucide:radar" class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Unlighthouse</span>
                <span class="truncate text-xs text-muted-foreground">Site auditing</span>
              </div>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in nav" :key="item.to">
              <SidebarMenuButton as-child :is-active="item.match(route.path)" :tooltip="item.label">
                <NuxtLink :to="item.to">
                  <Icon :name="item.icon" />
                  <span>{{ item.label }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup v-if="sites.length">
        <SidebarGroupLabel>Sites</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="site in sites" :key="site.id">
              <SidebarMenuButton
                as-child
                :is-active="activeSlug === siteSlug(site.url)"
                :tooltip="siteSlug(site.url)"
              >
                <NuxtLink :to="`/sites/${siteSlug(site.url)}`">
                  <Icon name="lucide:globe" />
                  <span>{{ site.name || siteSlug(site.url) }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>
