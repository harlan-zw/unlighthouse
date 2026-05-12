<script setup lang="ts">
import { website } from '~/composables/unlighthouse'
import { getScoreColor, getScoreBg } from '~/composables/dashboard'

defineProps<{
  title: string
  icon: string
  color?: string
  score?: number | null
  scoreLabel?: string
  stats?: { label: string, value: string | number, color?: string, icon?: string }[]
}>()

const router = useRouter()
const route = useRoute()
const scanId = computed(() => route.params.scanId as string | undefined)

const extractDomain = (url: string) => {
  try { return new URL(url).hostname }
  catch { return url }
}

function goBack() {
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
          class="w-14 h-14 rounded-xl flex items-center justify-center font-mono text-xl font-bold shrink-0"
          :class="[getScoreBg(score), getScoreColor(score)]"
        >
          {{ score ?? '-' }}
        </div>

        <div class="min-w-0">
          <!-- Title Row -->
          <div class="flex items-center gap-2">
            <UIcon :name="icon" class="w-5 h-5 shrink-0" :class="color || 'text-muted'" />
            <h1 class="text-lg font-semibold truncate">{{ title }}</h1>
            <template v-if="website">
              <span class="text-dimmed">·</span>
              <div class="flex items-center gap-1.5 text-dimmed">
                <img
                  :src="`https://www.google.com/s2/favicons?domain=${extractDomain(website)}&sz=32`"
                  :alt="website"
                  class="w-4 h-4 rounded shrink-0"
                  loading="lazy"
                >
                <span class="text-sm font-mono truncate">{{ extractDomain(website) }}</span>
              </div>
            </template>
          </div>

          <!-- Score Label -->
          <div v-if="score !== undefined" class="text-xs text-dimmed mt-0.5">
            <span v-if="score !== null && score >= 90" class="text-success">Good</span>
            <span v-else-if="score !== null && score >= 50" class="text-warning">Needs Work</span>
            <span v-else-if="score !== null" class="text-error">Poor</span>
            <span v-else>No data</span>
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
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-default rounded-lg hover:bg-elevated/60 transition-colors"
          @click="goBack"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>
    </div>
  </header>
</template>
