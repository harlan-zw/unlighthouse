<script setup lang="ts">
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

// The shared chrome for every primary layout (root / site / scan): the
// persistent AppSidebar plus a sticky top bar carrying the sidebar trigger,
// a contextual `#subnav` slot (breadcrumbs / tabs), and the global
// health-pulse + theme toggle that used to live in the old top header.
const colorMode = useColorMode()
const api = useApi()

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const healthy = ref<boolean | null>(null)
async function checkHealth() {
  try {
    await api['health']({})
    healthy.value = true
  }
  catch {
    healthy.value = false
  }
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  checkHealth()
  timer = setInterval(checkHealth, 30000)
})
onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
})
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header class="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger class="-ml-1" />
        <Separator orientation="vertical" class="mr-1 h-4" />

        <div class="flex min-w-0 flex-1 items-center">
          <slot name="subnav" />
        </div>

        <div class="ml-auto flex items-center gap-2">
          <div
            v-if="healthy !== null"
            class="flex items-center gap-1.5 text-xs"
            :class="healthy ? 'text-success' : 'text-destructive'"
            :title="healthy ? 'Backend connected' : 'Backend unreachable'"
          >
            <span class="relative flex size-1.5">
              <span
                class="relative inline-flex size-1.5 rounded-full"
                :class="healthy ? 'bg-success' : 'bg-destructive animate-pulse'"
              />
            </span>
            <span class="hidden sm:inline">{{ healthy ? 'Connected' : 'Disconnected' }}</span>
          </div>
          <button
            class="inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            :title="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleColorMode"
          >
            <Icon :name="colorMode.value === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="size-3.5" />
          </button>
        </div>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="mx-auto max-w-7xl px-4 py-6">
          <slot />
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
