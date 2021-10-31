<script setup lang="ts">
import {isDark, toggleDark, refetchStats, stats } from '../logic'

defineProps<{
  id?: string
}>()

onMounted(() => {
  setInterval(() => {
    refetchStats()
  }, 10000)
})
</script>

<template>
<nav class="font-light px-6 border-b border-main flex gap-4 h-54px children:my-auto mx-auto container">
  <template v-if="$route.path != '/'">
  <router-link v-if="$route.path != '/'" class="icon-btn !outline-none my-auto" to="/">
    <i-carbon-arrow-left/>
  </router-link>
  <div class="flex-auto"></div>
  </template>
  <template v-else>
  <i-vscode-icons-file-type-lighthouse class="text-5xl" />
  <span class="text-md font-bold text-teal-700 dark:text-teal-200">
    Unplugin Lighthouse
  </span>
  <div class="flex text-xs ml-5">
    <div class="mr-3">
      <div class="uppercase opacity-40 ">
        Status
      </div>
      <div class=" flex items-center">
        <span class="text-sm mr-1">{{ stats.runningTasks > 0 ? 'Working' : 'Listening' }}</span>
        <loading-spinner v-if="stats.runningTasks > 0 " />
      </div>
    </div>
    <div>
      <div class="uppercase opacity-40">
        Running Tasks
      </div>
      <span class="text-sm">{{ stats.runningTasks }}</span>
    </div>
  </div>
  <div class="flex-auto"></div>
  <a
      class="icon-btn text-lg"
      href="https://github.com/antfu/vite-plugin-inspect"
      target="_blank"
  >
    <i-carbon-logo-github/>
  </a>
  </template>
  <button class="icon-btn text-lg" title="Toggle Dark Mode" @click="toggleDark()">
    <i-carbon-moon v-if="isDark"/>
    <i-carbon-sun v-else/>
  </button>
</nav>
</template>
