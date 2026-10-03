<script setup lang="ts">
// Generic dashboard shell: fixed sidebar, content slot, mobile drawer.
// Pure layout — no auth, no banners, no app-specific chrome.
// Used by admin (AdminLayoutShell), pro (ProDashboardShell), and the
// design-system sandbox (brand-kit `kit` layout).
import type { VNodeChild } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { useRoute, useRouter } from 'nuxt/app'
import { provide, ref, watch } from 'vue'
import { provideUiAppShellNav } from '../../composables/useAppShellNav'
import { navDrawerCloseDecider, uiNavDrawerKey } from './ui-nav-drawer'

const { sidebarWidth = 64, flushContent = false, contentClass, inlineMobileNav = false } = defineProps<{
  sidebarWidth?: 56 | 64
  flushContent?: boolean
  /** Override the content padding (non-flush only). */
  contentClass?: string
  /** The page header draws the hamburger (+ switcher) inline with the page
   *  title below `lg` (via `useUiAppShellNav`), so the shell draws no separate
   *  mobile bar above the content. */
  inlineMobileNav?: boolean
}>()

const slots = defineSlots<{
  brand?: () => VNodeChild
  sidebar?: () => VNodeChild
  footer?: () => VNodeChild
  topBanners?: () => VNodeChild
  mobile?: (props: { closeNav: () => void }) => VNodeChild
  /** Inline content next to the mobile hamburger (e.g. the site/group switcher). */
  mobileNav?: () => VNodeChild
  default?: () => VNodeChild
  bottom?: () => VNodeChild
  extras?: () => VNodeChild
}>()

const navOpen = ref(false)
const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')

// An in-drawer pane switch (the sidebar mode tabs) IS a route change, but it
// must not close the drawer the way a page navigation does: the tab arms its
// destination here, and the watcher keeps the drawer open when that exact
// navigation lands. The watcher keys on fullPath, so every route change
// consumes the arm: a query-only change (the tabs flip a chatNonce) must not
// leave it armed for a later navigation. Only a path change closes.
const drawerNav = navDrawerCloseDecider()
function keepOpenFor(target: RouteLocationRaw) {
  drawerNav.arm(router.resolve(target).fullPath)
}
provide(uiNavDrawerKey, { keepOpenFor })

let watchedPath = route.path
watch(() => route.fullPath, () => {
  const pathChanged = route.path !== watchedPath
  watchedPath = route.path
  const close = drawerNav.shouldCloseOnRouteChange(route.fullPath)
  if (pathChanged && close)
    navOpen.value = false
})

if (import.meta.client) {
  watch(isDesktop, (desktop) => {
    if (desktop)
      navOpen.value = false
  })
}

function openNav() {
  navOpen.value = true
}

function closeNav() {
  navOpen.value = false
}

provideUiAppShellNav({ openNav })
</script>

<template>
  <div class="flex min-h-screen" data-allow-mismatch="children">
    <a
      href="#main-content"
      class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-default focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:ring-2 focus-visible:ring-primary"
    >Skip to content</a>
    <aside
      class="hidden lg:flex flex-col shrink-0 fixed top-0 bottom-0 left-0 border-r border-default bg-default"
      :class="sidebarWidth === 56 ? 'w-56' : 'w-64'"
    >
      <div v-if="slots.brand" class="shrink-0 px-3 pt-4 pb-2">
        <slot name="brand" />
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto scroll-overlay px-3 py-2 space-y-5">
        <slot name="sidebar" />
      </div>
      <div v-if="slots.footer" class="shrink-0 border-t border-default px-3 py-3">
        <slot name="footer" />
      </div>
    </aside>

    <div
      class="flex-1 min-w-0"
      :class="[
        sidebarWidth === 56 ? 'lg:ml-56' : 'lg:ml-64',
        flushContent ? 'h-screen flex flex-col' : '',
      ]"
    >
      <slot name="topBanners" />

      <div v-if="!inlineMobileNav" class="lg:hidden flex items-center gap-1 px-4 pt-3">
        <UiButton purpose="quiet" class="-ml-2 min-h-11 min-w-11 shrink-0" aria-label="Open navigation menu" @click="openNav()">
          <UiIcon name="menu" class="size-5" aria-hidden="true" />
        </UiButton>
        <div v-if="slots.mobileNav" class="min-w-0 flex-1">
          <slot name="mobileNav" />
        </div>
      </div>

      <div class="flex flex-col" :class="flushContent ? 'flex-1 min-h-0' : 'min-h-screen'">
        <main id="main-content" tabindex="-1" class="flex-1" :class="flushContent ? 'min-h-0' : (contentClass ?? 'p-4 sm:p-6 lg:p-8')">
          <slot />
        </main>
        <slot name="bottom" />
      </div>
    </div>

    <!-- A left drawer sizes to its content by default, which squeezed the nav
         to ~250px on a phone. Fixed width, capped so the scrim stays tappable.
         No handle: it is a swipe affordance for bottom sheets and overlapped
         the nav rows here. -->
    <UDrawer
      v-model:open="navOpen"
      title="Navigation menu"
      direction="left"
      :handle="false"
      :ui="{ content: 'w-80 max-w-[calc(100vw-3rem)]' }"
    >
      <template #content>
        <div class="flex flex-1 flex-col h-full min-w-0 overflow-x-hidden">
          <template v-if="slots.mobile">
            <div class="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-3">
              <slot name="mobile" :close-nav="closeNav" />
            </div>
          </template>
          <template v-else>
            <div v-if="slots.brand" class="shrink-0 px-5 pt-5 pb-2">
              <slot name="brand" />
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto scroll-overlay px-5 py-2 space-y-5">
              <slot name="sidebar" />
            </div>
            <div v-if="slots.footer" class="shrink-0 border-t border-default px-5 py-4">
              <slot name="footer" />
            </div>
          </template>
        </div>
      </template>
    </UDrawer>

    <slot name="extras" />
  </div>
</template>
