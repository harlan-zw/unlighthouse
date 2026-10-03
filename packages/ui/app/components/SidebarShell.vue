<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'
import ShellHeader from '~/features/navigation/components/ShellHeader.vue'

const [DefineBrand, Brand] = createReusableTemplate()
const [DefineFooter, Footer] = createReusableTemplate()
const route = useRoute()
const colorMode = useColorMode()
const { healthy } = useBackendHealth()
const isStatic = useIsStatic()
const fluid = computed(() => route.meta.fluid === true)
const content = useTemplateRef<HTMLElement>('content')
watch([() => route.path, () => route.hash], async () => {
  await nextTick()
  const target = route.hash ? document.getElementById(route.hash.slice(1)) : null
  if (target && content.value?.contains(target))
    target.scrollIntoView({ block: 'start' })
  else
    content.value?.scrollTo({ top: 0 })
})
function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <DefineBrand>
    <NuxtLink to="/" aria-label="Unlighthouse home" class="flex min-h-11 items-center gap-2 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <img src="/logo.png" alt="" width="28" height="28" class="size-7 object-contain">
      <span class="text-sm font-semibold">Unlighthouse</span>
    </NuxtLink>
  </DefineBrand>
  <DefineFooter>
    <div class="flex items-center justify-between gap-2">
      <span v-if="isStatic" class="text-sm text-muted" role="status">Offline report</span>
      <span v-else-if="healthy !== null" class="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
        <span class="size-1.5 rounded-full" :class="healthy ? 'bg-success' : 'bg-error'" aria-hidden="true" />
        {{ healthy ? 'Connected' : 'Disconnected' }}
      </span>
      <UiButton purpose="quiet" class="ml-auto min-h-11 min-w-11 justify-center lg:min-h-8 lg:min-w-8" :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" :icon="colorMode.value === 'dark' ? 'light' : 'dark'" @click="toggleColorMode" />
    </div>
  </DefineFooter>
  <UiAppShell flush-content inline-mobile-nav>
    <template #brand>
      <Brand />
    </template>
    <template #sidebar>
      <AppSidebar />
    </template>
    <template #footer>
      <Footer />
    </template>
    <template #mobile="{ closeNav }">
      <div class="flex h-full min-h-0 flex-col">
        <div class="flex shrink-0 items-center justify-between gap-2 pb-2">
          <Brand />
          <UiButton purpose="quiet" icon="close" aria-label="Close navigation menu" class="min-h-11 min-w-11 shrink-0 justify-center" @click="closeNav" />
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto scroll-overlay py-2 space-y-5">
          <AppSidebar />
        </div>
        <div class="-mx-5 -mb-3 shrink-0 border-t border-default px-5 py-4">
          <Footer />
        </div>
      </div>
    </template>
    <template #topBanners>
      <ShellHeader />
    </template>
    <div ref="content" class="h-full overflow-auto">
      <div class="px-4 py-6 sm:px-6" :class="fluid ? 'w-full' : 'mx-auto max-w-7xl'">
        <slot />
      </div>
    </div>
  </UiAppShell>
</template>
