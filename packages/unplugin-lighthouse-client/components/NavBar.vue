<script setup lang="ts">
import {isDark, toggleDark, stats, website } from '../logic'
import { formatDistance } from 'date-fns'

defineProps<{
  id?: string
}>()

const timeRemaining = computed(() => {
  return formatDistance(0, stats.value.monitor.timeRemining, { includeSeconds: true })
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
    UnLighthouse
  </span>
  <div class="flex w-full justify-between items-center text-xs ml-5">

    <div class="flex">
      <div class="mr-5">
        <div class="uppercase opacity-40 ">
          Website
        </div>
        <div class="text-sm flex items-center">
          <a :href="website" class="flex items-center" target="_blank">
            <img :src="website + '/favicon.ico'" width="16" height="16" class="mr-1">{{ website.replace('https://', '').replace('http://', '') }}
          </a>
        </div>
      </div>
      <div class="mr-5">
        <div class="uppercase opacity-40 ">
          Site Score
        </div>
        <div class=" flex items-center">
          <metric-guage :score="stats.score" stripped class="font-bold text-sm" />
        </div>
      </div>
      <div class="mr-5">
        <div class="uppercase opacity-40 ">
          Routes
        </div>
        <div class=" flex items-center">
          <span class="text-sm mr-1">{{ stats.staticRoutes }}</span>
        </div>
      </div>
    </div>
    <div>
      <search-box />
    </div>
    <div class="flex">
      <div class="mr-5">
        <div class="uppercase opacity-40 ">
          Worker Progress
        </div>
        <div class=" flex items-center">
          <span class="text-sm mr-1">
            {{ stats.monitor.donePercStr }}% <span class="text-xs opacity-60">{{ stats.monitor.doneTargets }}/{{ stats.monitor.allTargets }}</span></span>
        </div>
      </div>
      <div class="mr-5">
        <div class="uppercase opacity-40">
          Time Remaining
        </div>
        <span class="text-sm">{{ stats.monitor.status === 'completed' ? '-' : timeRemaining }}</span>
      </div>
      <div class="mr-5">
        <div class="uppercase opacity-40">
          CPU
        </div>
        <span class="text-sm">{{ stats.monitor.status === 'completed' ? '-' : stats.monitor.cpuUsage }}</span>
      </div>
      <div>
        <div class="uppercase opacity-40">
          Memory
        </div>
        <span class="text-sm">{{ stats.monitor.status === 'completed' ? '-' : stats.monitor.memoryUsage }}</span>
      </div>
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
