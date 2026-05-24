<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <header class="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="flex h-12 items-center gap-4 px-4">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold shrink-0">
          <div class="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Icon name="lucide:radar" class="size-3.5" />
          </div>
          <span class="text-sm">Unlighthouse</span>
        </NuxtLink>

        <div class="ml-auto flex items-center gap-1">
          <NuxtLink
            to="/scan/new"
            class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Icon name="lucide:plus" class="size-3.5" />
            <span class="hidden sm:inline">New Scan</span>
          </NuxtLink>
          <NuxtLink
            to="/history"
            class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Icon name="lucide:history" class="size-3.5" />
            <span class="hidden sm:inline">History</span>
          </NuxtLink>
          <button
            class="inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            @click="toggleColorMode"
          >
            <Icon :name="colorMode.value === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="size-3.5" />
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
