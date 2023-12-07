<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; links: { to: string; label: string }[] }>()
const emit = defineEmits(['update:modelValue'])

const isDialogOpen = useVModel(props, 'modelValue', emit)

const route = useRoute()
const isGuide = computed(() => {
  return route.path.startsWith('/guide')
})
const isIntegrations = computed(() => {
  return route.path.startsWith('/integrations')
})
const isApi = computed(() => {
  return route.path.startsWith('/api')
})
</script>

<template>
  <div class="flex items-center justify-between gap-2 h-16">
    <div class="flex items-center gap-6">
      <NuxtLink class="navbar-logo" to="/">
        <div class="flex items-center">
          <div class="flex items-center lg:mr-5">
            <div class="mr-2 hidden md:block">
              <img src="/logo-dark.svg" alt="Unlighthouse Logo" class="block dark:hidden text-black dark:text-white w-5 h-5">
              <img src="/logo-light.svg" alt="Unlighthouse Logo" class="hidden dark:block text-black dark:text-white w-5 h-5">
            </div>
            <div class="flex flex-col">
              <h1 class="font-bold text-xl">
                Unlighthouse
              </h1>
            </div>
          </div>
        </div>
      </NuxtLink>
    </div>

    <div class="space-x-5 flex">
      <UButton to="/guide/getting-started/unlighthouse-cli" :variant="!isGuide ? 'ghost' : 'outline'" class="md:block hidden">
        <span class="text-gray-700 dark:text-gray-200">Guide</span>
      </UButton>
      <UButton to="/integrations/cli" :variant="!isIntegrations ? 'ghost' : 'outline'" class="md:block hidden">
        <span class="text-gray-700 dark:text-gray-200">Integration</span>
      </UButton>
      <UButton to="/api/config" :variant="!isApi ? 'ghost' : 'outline'" class="md:block hidden">
        <span class="text-gray-700 dark:text-gray-200">API</span>
      </UButton>
    </div>

    <div class="flex items-center justify-end -mr-1.5 gap-3">
      <LegoGithubStar v-slot="{ stars }" repo="harlan-zw/unlighthouse" class="hidden md:flex mr-5 group border dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700 hover:bg-gray-200 dark:bg-gray-900 bg-gray-100 transition rounded-lg text-sm justify-center">
        <div class="flex items-center transition rounded-l px-2 py-1 space-x-1">
          <Icon name="uil:star" class="group-hover:op75 " />
          <div>Star</div>
        </div>
        <div class="px-2 py-1 dark:bg-black/20 bg-white rounded-r-lg">
          {{ stars }}
        </div>
      </LegoGithubStar>
      <DocsSearchButton class="ml-1.5 flex-1 lg:flex-none lg:w-48" />

      <div class="flex items-center lg:gap-1.5">
        <UColorModeButton />

        <UButton
          to="https://twitter.com/harlan_zw"
          target="_blank"
          color="gray"
          variant="ghost"
          class="hidden lg:inline-flex"
          icon="i-simple-icons-twitter"
        />

        <UButton
          to="https://github.com/harlan-zw"
          target="_blank"
          color="gray"
          variant="ghost"
          class="hidden lg:inline-flex"
          icon="i-simple-icons-github"
        />

        <UButton
          color="gray"
          variant="ghost"
          class="lg:hidden"
          :icon="isDialogOpen ? 'i-heroicons-x-mark-20-solid' : 'i-heroicons-bars-3-20-solid'"
          @click="isDialogOpen = !isDialogOpen"
        />
      </div>
    </div>
  </div>
</template>
