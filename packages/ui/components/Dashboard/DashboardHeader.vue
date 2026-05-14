<script setup lang="ts">
import { siteHostname, useSites } from '~/composables/sites'
import { useUnlighthouseConfig } from '~/composables/useUnlighthouseConfig'

defineProps<{
  title: string
  icon: string
  color?: string
  score?: number | null
  scoreLabel?: string
  stats?: { label: string, value: string | number, color?: string, icon?: string }[]
}>()

const { website: fallbackWebsite } = useUnlighthouseConfig()
const injectedSiteUrl = inject<ComputedRef<string>>('siteUrl', computed(() => ''))
const website = computed(() => injectedSiteUrl.value || fallbackWebsite.value)
const { sites } = useSites()

const router = useRouter()
const route = useRoute()
const scanId = computed(() => route.params.scanId as string | undefined)
const isOverview = computed(() => !!scanId.value && route.path === `/results/${scanId.value}`)

function goBack() {
  if (isOverview.value && scanId.value) {
    const sid = sites.value.find(s => s.url === injectedSiteUrl.value)?.id
    router.push(sid ? `/sites/${sid}` : '/')
    return
  }
  router.push(scanId.value ? `/results/${scanId.value}` : '/')
}
</script>

<template>
  <header class="mb-6">
    <div class="flex items-center justify-between gap-4">
      <!-- Left: Score + Title + Site -->
      <div class="flex items-center gap-4">
        <!-- Score Badge -->
        <div
          v-if="score !== undefined"
          class="w-14 h-14 rounded-sm flex items-center justify-center font-mono text-xl font-bold shrink-0"
          :class="[getScoreBg(score), getScoreColor(score)]"
        >
          {{ score ?? '-' }}
        </div>

        <div class="min-w-0">
          <!-- Title Row -->
          <div class="flex items-center gap-2">
            <UIcon :name="icon" class="w-5 h-5 shrink-0" :class="color || 'text-muted'" />
            <h1 class="text-lg font-semibold truncate">
              {{ title }}
            </h1>
            <template v-if="website">
              <span class="text-dimmed">·</span>
              <div class="flex items-center gap-1.5 text-dimmed">
                <SiteFavicon :url="website" :alt="website" class="w-4 h-4" />
                <span class="text-sm font-mono truncate">{{ siteHostname(website) }}</span>
              </div>
            </template>
          </div>

          <!-- Score Label -->
          <div v-if="score !== undefined" class="text-xs text-dimmed mt-0.5">
            <span v-if="score !== null && score >= 90" class="text-success">passing</span>
            <span v-else-if="score !== null && score >= 50" class="text-warning">needs work</span>
            <span v-else-if="score !== null" class="text-error">poor</span>
            <span v-else>no data</span>
            <span class="text-dimmed ml-1">{{ scoreLabel || 'avg score' }}</span>
          </div>
        </div>
      </div>

      <!-- Right: Stats + Back -->
      <div class="flex items-center gap-6 shrink-0">
        <!-- Stats -->
        <div v-if="stats?.length" class="hidden sm:flex items-center gap-4">
          <div v-for="stat in stats" :key="stat.label" class="flex items-center gap-1.5">
            <UIcon v-if="stat.icon" :name="stat.icon" class="w-3.5 h-3.5 text-dimmed" />
            <span class="text-sm font-mono font-medium" :class="stat.color || 'text-highlighted'">{{ stat.value }}</span>
            <span class="text-xs text-dimmed">{{ stat.label }}</span>
          </div>
        </div>

        <button
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-default rounded-sm hover:bg-elevated/60 transition-colors"
          @click="goBack"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>
    </div>
  </header>
</template>
