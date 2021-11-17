<script setup lang="ts">
import { formatDistance } from 'date-fns'
import { isDark, toggleDark, stats, website, rescanAll } from '../logic'

const timeRemaining = computed(() => {
  return formatDistance(0, stats.value.monitor.timeRemaining, { includeSeconds: true })
})
</script>

<template>
  <nav class="font-light px-6 border-b border-main flex gap-4 h-54px children:my-auto mx-auto container">
    <template v-if="$route.path != '/'">
      <router-link v-if="$route.path != '/'" class="icon-btn !outline-none my-auto" to="/">
        <i-carbon-arrow-left />
      </router-link>
      <div class="flex-auto"></div>
    </template>
    <template v-else>
      <i-vscode-icons-file-type-lighthouse class="text-5xl" />
      <span class="text-md font-bold text-teal-700 dark:text-teal-200">
        Unlighthouse
      </span>
      <div class="flex w-full justify-between items-center text-xs ml-5">
        <div class="flex items-center">
          <div v-if="website" class="mr-5">
            <div class="uppercase opacity-40 ">
              Website
            </div>
            <div class="text-sm flex items-center">
              <a :href="website" class="flex items-center pt-1" target="_blank">
                <img :src="website + '/favicon.ico'" width="16" height="16" class="mr-1">{{ website.replace('https://', '').replace('http://', '') }}
              </a>
            </div>
          </div>
          <div v-if="!stats">
            <div class="text-sm opacity-70">
              Disconnected from server...
            </div>
          </div>
          <div v-if="stats?.score" class="mr-5">
            <div class="uppercase opacity-40 ">
              Site Score
            </div>
            <div class=" flex items-center">
              <metric-guage  :score="stats.score" stripped class="font-bold text-sm" />
            </div>
          </div>
          <div v-if="stats?.monitor" class="mr-5">
            <div class="uppercase opacity-40 ">
              Routes
            </div>
            <div class=" flex items-center">
              <span class="text-base mr-1">{{ stats.monitor.allTargets / 2 }}</span>
            </div>
          </div>
        </div>
        <div v-if="stats?.monitor?.allTargets > 0" class="flex flex-grow">
          <search-box />
          <button
              type="button"
              @click="rescanAll"
              class="ml-3 inline-flex items-center mr-2 px-2 py-1 text-sm font-medium text-white bg-black rounded-md bg-opacity-20 hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
          >
            <i-carbon-renew class="text-sm mr-2  opacity-50" />
            Rescan Site
          </button>
        </div>
        <div v-if="stats?.monitor" class="flex">
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
      <btn-icon
        class="icon-btn text-lg"
        href="https://github.com/antfu/vite-plugin-inspect"
        target="_blank"
      >
        <i-carbon-logo-github />
      </btn-icon>
    </template>
    <btn-icon class="text-lg" title="Toggle Dark Mode" @click="toggleDark()">
      <i-carbon-moon v-if="isDark" />
      <i-carbon-sun v-else />
    </btn-icon>
  </nav>
</template>
