<script setup lang="ts">
// Generic dashboard shell: fixed sidebar, content slot, mobile drawer.
// Pure layout — no auth, no banners, no app-specific chrome.
// Used by admin (AdminLayoutShell), pro (ProDashboardShell), and the
// design-system sandbox (brand-kit `kit` layout).
import { useMediaQuery } from '@vueuse/core'
import { useRoute } from 'nuxt/app'
import { ref, watch } from 'vue'

const { sidebarWidth = 64, flushContent = false, contentClass } = defineProps<{
  sidebarWidth?: 56 | 64
  flushContent?: boolean
  /** Override the content padding (non-flush only). */
  contentClass?: string
}>()

const slots = defineSlots<{
  brand?: () => unknown
  sidebar?: () => unknown
  footer?: () => unknown
  topBanners?: () => unknown
  mobile?: (props: { closeNav: () => void }) => unknown
  /** Inline content next to the mobile hamburger (e.g. the site/group switcher). */
  mobileNav?: () => unknown
  default?: () => unknown
  bottom?: () => unknown
  extras?: () => unknown
}>()

const navOpen = ref(false)
const route = useRoute()
const isDesktop = useMediaQuery('(min-width: 1024px)')

watch(() => route.path, () => {
  navOpen.value = false
})

if (import.meta.client) {
  watch(isDesktop, (desktop) => {
    if (desktop)
      navOpen.value = false
  })
}

function closeNav() {
  navOpen.value = false
}
</script>

<template>
  <div class="flex min-h-dvh" data-allow-mismatch="children">
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
        flushContent ? 'h-dvh flex flex-col' : '',
      ]"
    >
      <slot name="topBanners" />

      <div class="lg:hidden flex items-center gap-1 px-4 pt-3">
        <UiButton purpose="quiet" class="-ml-2 min-h-11 shrink-0" aria-label="Open navigation menu" @click="navOpen = true">
          <UiIcon name="menu" class="size-5" aria-hidden="true" />
        </UiButton>
        <div v-if="slots.mobileNav" class="min-w-0 flex-1">
          <slot name="mobileNav" />
        </div>
      </div>

      <div class="flex flex-col" :class="flushContent ? 'flex-1 min-h-0' : 'min-h-dvh'">
        <main id="main-content" class="flex-1" :class="flushContent ? 'min-h-0' : (contentClass ?? 'p-4 sm:p-6 lg:p-8')">
          <slot />
        </main>
        <slot name="bottom" />
      </div>
    </div>

    <UDrawer v-model:open="navOpen" direction="left">
      <template #content>
        <div class="flex flex-col h-full min-w-0 overflow-x-hidden">
          <template v-if="slots.mobile">
            <div class="flex-1 min-h-0 overflow-y-auto p-5">
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
