<script setup lang="ts">
const { sidebarWidth = 64, logoTo = '/' } = defineProps<{
  sidebarWidth?: 56 | 64
  logoTo?: string
}>()

const route = useRoute()
const navOpen = ref(false)

watch(() => route.path, () => {
  navOpen.value = false
})

function closeNav() {
  navOpen.value = false
}
</script>

<template>
  <div class="flex min-h-screen bg-default text-default">
    <aside
      class="hidden lg:flex flex-col shrink-0 fixed top-0 bottom-0 left-0 border-r border-default bg-default"
      :class="sidebarWidth === 56 ? 'w-56' : 'w-64'"
    >
      <div class="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <NuxtLink :to="logoTo" class="flex items-center gap-2 px-2 font-semibold text-base text-highlighted">
          <div class="w-7 h-7 rounded-lg bg-elevated ring-1 ring-default flex items-center justify-center shrink-0">
            <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-highlighted" />
          </div>
          Unlighthouse
        </NuxtLink>
        <slot name="sidebar" :close-nav="closeNav" />
      </div>
      <div class="shrink-0 border-t border-default px-3 py-3">
        <slot name="footer">
          <div class="flex items-center justify-between gap-2 text-xs text-dimmed">
            <div class="flex items-center gap-2">
              <a href="https://unlighthouse.dev" target="_blank" class="hover:text-default transition-colors">Docs</a>
              <span aria-hidden="true">·</span>
              <a href="https://github.com/harlan-zw/unlighthouse" target="_blank" class="hover:text-default transition-colors">GitHub</a>
            </div>
            <UColorModeButton size="xs" variant="ghost" color="neutral" class="shrink-0" />
          </div>
        </slot>
      </div>
    </aside>

    <div class="flex-1 min-w-0" :class="sidebarWidth === 56 ? 'lg:ml-56' : 'lg:ml-64'">
      <div class="lg:hidden flex items-center justify-between px-4 pt-4">
        <UButton variant="ghost" color="neutral" class="-ml-2" aria-label="Open navigation menu" @click="navOpen = true">
          <UIcon name="i-lucide-menu" class="size-5" aria-hidden="true" />
          <span class="ml-2">Menu</span>
        </UButton>
        <NuxtLink :to="logoTo" class="flex items-center gap-2 font-semibold text-sm text-highlighted">
          <div class="w-6 h-6 rounded-md bg-elevated ring-1 ring-default flex items-center justify-center">
            <UIcon name="i-heroicons-light-bulb" class="w-3.5 h-3.5 text-highlighted" />
          </div>
          Unlighthouse
        </NuxtLink>
      </div>
      <div class="flex flex-col min-h-screen">
        <div class="flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <slot />
        </div>
        <slot name="bottom" />
      </div>
    </div>

    <UDrawer v-model:open="navOpen" direction="left">
      <template #content>
        <div class="p-4 overflow-y-auto overflow-x-hidden min-w-0 w-72">
          <slot name="mobile" :close-nav="closeNav">
            <slot name="sidebar" :close-nav="closeNav" />
          </slot>
        </div>
      </template>
    </UDrawer>
  </div>
</template>
