<script setup lang="ts">
import { formatDistance } from 'date-fns'
import { searchText } from '~/composables/search'
import { scanMeta, isOffline } from '~/composables/state'
import { isStatic, website, basePath } from '~/composables/unlighthouse'
import { isRescanSiteRequestRunning, rescanSite } from '~/composables/actions'

const timeRemaining = computed(() => {
  return formatDistance(0, scanMeta.value?.monitor?.timeRemaining || 0, { includeSeconds: true })
})

const version = typeof __UNLIGHTHOUSE_VERSION__ !== 'undefined' ? __UNLIGHTHOUSE_VERSION__ : '0.0.0'

const favIcon = computed(() => {
  if (!scanMeta.value?.favicon) return '/favicon.ico'
  if (scanMeta.value?.favicon?.startsWith('http')) return scanMeta.value?.favicon
  return website.value + (scanMeta.value?.favicon)
})
</script>

<template>
  <nav class="bg-white dark:bg-transparent font-light border-b border-main flex items-center gap-4 children:my-auto px-3 md:px-6 py-2 ">
    <a class="text-md font-medium text-teal-700 dark:text-teal-200 font-mono items-center hidden md:flex cursor-pointer" href="https://unlighthouse.dev" target="_blank">
      <img :src="basePath && basePath !== '/' ? `${basePath}assets/logo-light.svg` : 'assets/logo-light.svg'" height="24" width="24" class="w-[24px] h-[24px] mr-2 hidden dark:block" alt="Unlighthouse logo">
      <img :src="basePath && basePath !== '/' ? `${basePath}assets/logo-dark.svg` : 'assets/logo-dark.svg'" height="24" width="24" class="w-[24px] h-[24px] mr-2 block dark:hidden" alt="Unlighthouse logo">
      <div class="flex flex-col">
        <span>Unlighthouse</span>
        <span class="text-xs text-gray-500 dark:text-gray-400 font-normal">v{{ version }}</span>
      </div>
    </a>
    <div class="flex w-full justify-between items-center text-xs md:ml-5 md:mr-10">
      <div class="flex items-center">
        <div v-if="website && !website.includes('localhost')" class="mr-5 hidden xl:block">
          <StatItem
            label="Website"
            size="sm"
          >
            <template #value>
              <img alt="" :src="favIcon" width="16" height="16" class="mr-1 inline-block">
              <span>{{ website.replace('https://', '').replace('http://', '').replace('www.', '') }}</span>
            </template>
          </StatItem>
        </div>
        <div v-if="isOffline" class="mr-5 hidden md:block">
          <UBadge color="warning" variant="subtle">
            {{ isStatic ? 'Static' : 'Offline' }} Mode
          </UBadge>
        </div>
        <div v-if="scanMeta" class="mr-5 hidden md:block">
          <div class="uppercase opacity-55">
            Total Score
          </div>
          <div class="flex items-center">
            <MetricGuage v-if="scanMeta?.score" :score="(scanMeta as any).score" :stripped="true" class="font-medium text-sm" />
            <UIcon v-else name="i-svg-spinners-90-ring-with-bg" class="h-[24px]" />
          </div>
        </div>
      </div>
      <div v-if="(scanMeta as any)?.monitor?.allTargets > 0" class="flex grow justify-around md:mr-5">
        <UInput
          v-model="searchText"
          icon="i-carbon-search"
          placeholder="Search routes"
          aria-label="Search lighthouse routes"
          class="grow mr-3 md:mr-5"
          :class="[searchText.length > 0 ? 'dark:bg-teal-700 bg-blue-900' : '']"
        />
        <UDropdownMenu
          :items="[[{
            label: 'Rescan Site',
            description: 'Crawl the site again and generate fresh new reports.',
            icon: 'i-mdi-magnify-scan',
            disabled: isRescanSiteRequestRunning || isStatic || isOffline,
            onSelect: () => rescanSite(),
          }]]"
        >
          <UButton
            icon="i-heroicons-ellipsis-vertical"
            size="sm"
            color="neutral"
            variant="ghost"
            :loading="isRescanSiteRequestRunning"
          />
        </UDropdownMenu>
      </div>
      <div v-if="!isOffline && scanMeta?.monitor" class="hidden xl:flex">
        <div class="mr-6">
          <StatItem
            label="Worker Progress"
            :value="`${(scanMeta as any).monitor.donePercStr}% (${(scanMeta as any).monitor.doneTargets}/${(scanMeta as any).monitor.allTargets})`"
            size="sm"
          />
        </div>
        <div class="mr-6 hidden xl:block">
          <StatItem
            label="Time Remaining"
            :value="(scanMeta as any).monitor.status === 'completed' ? '-' : timeRemaining"
            size="sm"
          />
        </div>
        <div class="mr-6 hidden xl:block">
          <StatItem
            label="CPU"
            :value="(scanMeta as any).monitor.status === 'completed' ? '-' : (scanMeta as any).monitor.cpuUsage"
            size="sm"
          />
        </div>
      </div>
    </div>
    <div class="hidden md:flex-auto" />
    <UButton
      to="https://github.com/harlan-zw/unlighthouse"
      target="_blank"
      icon="i-carbon-logo-github"
      variant="ghost"
      color="neutral"
      size="lg"
    />
    <UColorModeButton size="lg" />
  </nav>
</template>
