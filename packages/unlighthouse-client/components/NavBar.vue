<script setup lang="ts">
import { formatDistance } from 'date-fns'
import { isDark, toggleDark, stats, website, rescanSite, isRescanSiteRequestRunning } from '../logic'

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
          <div v-if="stats" class="mr-5">
            <div class="uppercase opacity-40 ">
              Site Score
            </div>
            <div class="flex items-center">
              <metric-guage v-if="stats?.score" :score="stats.score" stripped class="font-bold text-sm" />
            </div>
          </div>
          <div v-if="stats?.monitor" class="mr-5">
            <div class="uppercase opacity-40 ">
              Routes
            </div>
            <div class=" flex items-center">
              <span class="text-base mr-1">{{ stats.routes }}</span>
            </div>
          </div>
        </div>
        <div v-if="stats?.monitor?.allTargets > 0" class="flex flex-grow">
          <search-box />
          <button
              type="button"
              @click="rescanSite"
              class="ml-3 inline-flex items-center mr-2 px-2 py-1 text-sm font-medium text-white bg-black rounded-md bg-opacity-20 hover:bg-opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
              :disabled="isRescanSiteRequestRunning"
          >
            <i-carbon-renew class="text-sm mr-2 opacity-50" :class="isRescanSiteRequestRunning ? ['animated animate-spin '] : []" />
            Rescan Site
          </button>
        </div>
        <div v-if="stats?.monitor" class="mr-5">
          <div class="uppercase opacity-40 ">
            Emulation
          </div>
          <div class=" flex items-center text-xs ">
            <tooltip width="400">
            <i-akar-icons-mobile-device class=""/>
            <span class="mr-1">Moto G4 - Slow 4g</span>
              <template #tooltip>
              <ul class="lh-meta__items">
                <li class="lh-meta__item lh-report-icon lh-report-icon--date">
                  Captured at Nov 18, 2021, 6:50 PM GMT+11
                </li>
                <li class="lh-meta__item lh-tooltip-boundary lh-report-icon lh-report-icon--devices">
                  Emulated Moto G4 with Lighthouse 9.0.0<div class="lh-tooltip">CPU/Memory Power: 1586
                CPU throttling: 4x slowdown (Simulated)
                Axe version: 4.2.3</div>
                </li>
                <li class="lh-meta__item lh-tooltip-boundary lh-report-icon lh-report-icon--samples-one">
                  Single page load<div class="lh-tooltip">This data is taken from a single page load, as opposed to field data summarizing many sessions.</div></li>
                <li class="lh-meta__item lh-report-icon lh-report-icon--stopwatch">Initial page load</li>
                <li class="lh-meta__item lh-tooltip-boundary lh-report-icon lh-report-icon--networkspeed">Slow 4G throttling<div class="lh-tooltip">Network throttling: 150&nbsp;ms TCP RTT, 1,638.4&nbsp;Kbps throughput (Simulated)</div></li>
                <li class="lh-meta__item lh-tooltip-boundary lh-report-icon lh-report-icon--chrome">Using HeadlessChromium 93.0.4577.0 with node<div class="lh-tooltip">User agent (network): "Mozilla/5.0 (Linux; Android 7.0; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4695.0 Mobile Safari/537.36 Chrome-Lighthouse"</div></li>
              </ul>
              </template>
            </tooltip>
          </div>
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
