<script setup lang="ts">
import { useUiAppShellNav } from '#layers/design-system/app/composables/useAppShellNav'

const nav = useUiAppShellNav()
const route = useRoute()
const inSite = computed(() => Boolean(route.params.siteId))
const inPack = computed(() => Boolean(route.params.pack))
const { data: packs } = useApiQuery('pack.list', () => ({}), { enabled: inPack })
const section = computed(() => {
  if (inPack.value)
    return packs.value?.packs.find(pack => pack.name === route.params.pack)?.ui.tab || String(route.params.pack)
  if (route.params.scanId)
    return route.path.endsWith('/overview') ? 'Overview' : 'Routes'
  if (inSite.value)
    return route.path.endsWith('/compare') ? 'Compare scans' : 'Scan history'
  if (route.path === '/agents')
    return 'Agents'
  return route.path === '/scan/new' ? 'Run scan' : 'Sites'
})
</script>

<template>
  <header class="z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-default bg-default px-4 sm:px-6">
    <UiButton v-if="nav" purpose="quiet" icon="menu" class="-ml-2 min-h-11 min-w-11 justify-center lg:hidden" aria-label="Open navigation menu" @click="nav.openNav()" />
    <nav aria-label="Breadcrumb" class="flex min-w-0 flex-1 items-center gap-2">
      <template v-if="inSite">
        <SiteSwitcher /><span class="text-muted" aria-hidden="true">/</span>
      </template>
      <span class="truncate text-sm" :class="inSite ? 'text-muted' : 'font-semibold text-highlighted'">{{ section }}</span>
    </nav>
    <NuxtLink v-if="inSite" to="/" class="hidden min-h-11 items-center px-2 text-sm text-muted hover:text-default sm:inline-flex">
      All sites
    </NuxtLink>
  </header>
</template>
