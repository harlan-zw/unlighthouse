<script setup lang="ts">
import { getScoreColor, getScoreBg } from '~/composables/dashboard'

const props = defineProps<{
  score: number | null
  stats: { label: string, value: string | number, color?: string, icon?: string }[]
}>()
</script>

<template>
  <div class="mb-6 p-4 rounded-xl bg-elevated/40 border border-default">
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
          <div class="text-xs text-dimmed uppercase tracking-wider">Avg Score</div>
          <div class="text-sm text-muted mt-0.5">
            <span v-if="score !== null && score >= 90" class="text-success">Good</span>
            <span v-else-if="score !== null && score >= 50" class="text-warning">Needs Work</span>
            <span v-else-if="score !== null" class="text-error">Poor</span>
            <span v-else>No data</span>
          </div>
        </div>
      </div>

      <div class="h-10 w-px bg-elevated" />

      <!-- Stats -->
      <div class="flex items-center gap-6 flex-1">
        <div v-for="stat in stats" :key="stat.label" class="flex items-center gap-2">
          <UIcon v-if="stat.icon" :name="stat.icon" class="w-4 h-4 text-dimmed" />
          <div>
            <div class="text-lg font-mono font-semibold" :class="stat.color || 'text-highlighted'">
              {{ stat.value }}
            </div>
            <div class="text-xs text-dimmed">{{ stat.label }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
