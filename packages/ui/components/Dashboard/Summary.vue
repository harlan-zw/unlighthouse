<script setup lang="ts">
import { getScoreColor, getScoreBg } from '~/composables/dashboard'

const props = defineProps<{
  score: number | null
  stats: { label: string, value: string | number, color?: string, icon?: string }[]
}>()
</script>

<template>
  <div class="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/5">
    <div class="flex items-center gap-6">
      <!-- Main Score -->
      <div class="flex items-center gap-4">
        <div
          class="w-16 h-16 rounded-xl flex items-center justify-center font-mono text-2xl font-bold"
          :class="[getScoreBg(score), getScoreColor(score)]"
        >
          {{ score ?? '-' }}
        </div>
        <div>
          <div class="text-xs text-gray-500 uppercase tracking-wider">Avg Score</div>
          <div class="text-sm text-gray-400 mt-0.5">
            <span v-if="score !== null && score >= 90" class="text-green-400">Good</span>
            <span v-else-if="score !== null && score >= 50" class="text-amber-400">Needs Work</span>
            <span v-else-if="score !== null" class="text-red-400">Poor</span>
            <span v-else>No data</span>
          </div>
        </div>
      </div>

      <div class="h-10 w-px bg-white/10" />

      <!-- Stats -->
      <div class="flex items-center gap-6 flex-1">
        <div v-for="stat in stats" :key="stat.label" class="flex items-center gap-2">
          <UIcon v-if="stat.icon" :name="stat.icon" class="w-4 h-4 text-gray-500" />
          <div>
            <div class="text-lg font-mono font-semibold" :class="stat.color || 'text-white'">
              {{ stat.value }}
            </div>
            <div class="text-xs text-gray-500">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
