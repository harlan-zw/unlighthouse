<script setup lang="ts">
import { formatDistance } from 'date-fns'
import {
  basePath,
  changeSite,
  isChangeSiteRequestRunning,
  isDark,
  isOffline,
  isRescanSiteRequestRunning,
  isStatic,
  rescanSite,
  scanMeta,
  startScan,
  toggleDark,
  website,
} from '../logic'

const timeRemaining = computed(() => {
  if (!scanMeta.value?.monitor?.timeRemaining) return '-'
  return formatDistance(0, scanMeta.value.monitor.timeRemaining, { includeSeconds: true })
})

const version = __UNLIGHTHOUSE_VERSION__

// Editable target URL - initialized with current website
const targetUrl = ref(website || '')

// Watch for website changes to update the input
watch(() => website, (newValue) => {
  if (newValue && !targetUrl.value) {
    targetUrl.value = newValue
  }
}, { immediate: true })

function handleGoClick() {
  if (!targetUrl.value) return

  // If URL is the same as current website, just start the scan
  if (targetUrl.value === website) {
    startScan(() => {})
  }
  else {
    // URL changed, change site and start scanning
    changeSite(targetUrl.value, () => {})
  }
}

function handleKeyEnter() {
  handleGoClick()
}
</script>

<template>
  <nav class="bg-white dark:bg-transparent font-light border-b border-main flex items-center gap-4 children:my-auto px-3 md:px-6 py-2 ">
    <a class="text-md font-medium text-teal-700 dark:text-teal-200 font-mono items-center hidden md:flex cursor-pointer" href="https://scalecampaign.com" target="_blank">
      <img :src="basePath && basePath !== '/' ? `${basePath}assets/logo-light.svg` : 'assets/logo-light.svg'" height="24" width="24" class="w-[24px] h-[24px] mr-2 hidden dark:block" alt="Scale Campaign logo">
      <img :src="basePath && basePath !== '/' ? `${basePath}assets/logo-dark.svg` : 'assets/logo-dark.svg'" height="24" width="24" class="w-[24px] h-[24px] mr-2 block dark:hidden" alt="Scale Campaign logo">
      <div class="flex flex-col">
        <span>Scale Campaign</span>
        <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">Lighthouse v{{ version }}</span>
      </div>
    </a>
    <div class="flex w-full justify-between items-center text-xs md:ml-5 md:mr-10">
      <div class="flex items-center">
        <!-- Target URL Input with Go Button -->
        <div class="mr-4 flex items-center">
          <div class="uppercase opacity-55 mr-2 hidden sm:block">
            Target
          </div>
          <div class="flex items-center">
            <input
              v-model="targetUrl"
              type="text"
              placeholder="https://example.com or localhost:8000"
              class="w-[280px] px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-l-md focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-800 dark:text-white"
              :disabled="isStatic || isOffline || isChangeSiteRequestRunning"
              @keyup.enter="handleKeyEnter"
            >
            <UButton
              color="primary"
              size="xs"
              class="rounded-l-none"
              :loading="isChangeSiteRequestRunning"
              :disabled="isStatic || isOffline || !targetUrl || isChangeSiteRequestRunning"
              @click="handleGoClick"
            >
              Go
            </UButton>
          </div>
        </div>

        <div v-if="isOffline" class="mr-5 hidden md:block">
          <warning-chip>
            {{ isStatic ? 'Static' : 'Offline' }} Mode
          </warning-chip>
        </div>
        <div v-if="scanMeta" class="mr-5 hidden md:block">
          <div class="uppercase opacity-55">
            Total Score
          </div>
          <div class="flex items-center">
            <metric-guage v-if="scanMeta?.score" :score="scanMeta.score" :stripped="true" class="font-medium text-sm" />
            <loading-spinner v-else class="h-[24px]" />
          </div>
        </div>
      </div>
      <div v-if="scanMeta?.monitor?.allTargets > 0" class="flex grow justify-around md:mr-5">
        <search-box class="grow mr-3 md:mr-5 max-w-[300px]" />
        <UDropdownMenu
          :items="[[
            {
              label: 'Rescan Site',
              description: 'Crawl the site again and generate fresh new reports.',
              icon: 'i-mdi-magnify-scan',
              disabled: isRescanSiteRequestRunning || isStatic || isOffline,
              onSelect: () => rescanSite(),
            },
          ]]" :content="{ placement: 'bottom' }"
        >
          <UButton
            icon="i-heroicons-ellipsis-vertical"
            size="sm"
            color="gray"
            variant="ghost"
            :loading="isRescanSiteRequestRunning"
          />
        </UDropdownMenu>
      </div>
      <div v-if="!isOffline && scanMeta?.monitor" class="hidden xl:flex">
        <div class="mr-6">
          <stat-item
            label="Worker Progress"
            :value="`${scanMeta.monitor.donePercStr}% (${scanMeta.monitor.doneTargets}/${scanMeta.monitor.allTargets})`"
            size="sm"
          />
        </div>
        <div class="mr-6 hidden xl:block">
          <stat-item
            label="Time Remaining"
            :value="scanMeta.monitor.status === 'completed' ? '-' : timeRemaining"
            size="sm"
          />
        </div>
        <div class="mr-6 hidden xl:block">
          <stat-item
            label="CPU"
            :value="scanMeta.monitor.status === 'completed' ? '-' : scanMeta.monitor.cpuUsage"
            size="sm"
          />
        </div>
      </div>
    </div>
    <div class="hidden md:flex-auto" />
    <btn-icon
      class="icon-btn text-lg"
      href="https://github.com/acenji/lighthouse"
      target="_blank"
    >
      <UIcon name="i-carbon-logo-github" />
    </btn-icon>
    <btn-icon class="text-lg cursor-pointer" title="Toggle Dark Mode" @click="toggleDark()">
      <UIcon v-if="isDark" name="i-carbon-moon" />
      <UIcon v-else name="i-carbon-sun" />
    </btn-icon>
  </nav>
</template>
