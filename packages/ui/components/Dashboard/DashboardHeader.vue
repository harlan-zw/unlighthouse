<script setup lang="ts">
import { getScoreColor, getScoreBg } from '~/composables/dashboard'

defineProps<{
  title: string
  icon: string
  color?: string
  score?: number | null
  stats?: Array<{
    label: string
    value: number | string
    color?: string
    icon?: string
  }>
}>()
</script>

<template>
  <div class="mb-6">
    <div class="flex items-center justify-between gap-4 mb-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5">
          <UIcon :name="icon" class="w-5 h-5" :class="color || 'text-white'" />
        </div>
        <h1 class="text-xl font-semibold text-white">{{ title }}</h1>
      </div>
      <div
        v-if="score !== undefined && score !== null"
        class="w-14 h-14 rounded-xl flex items-center justify-center font-mono text-xl font-bold"
        :class="[getScoreBg(score), getScoreColor(score)]"
      >
        {{ score }}
      </div>
    </div>

    <div v-if="stats?.length" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3"
      >
        <div class="flex items-center gap-2 mb-1">
          <UIcon v-if="stat.icon" :name="stat.icon" class="w-4 h-4 text-gray-500" />
          <span class="text-xs text-gray-500">{{ stat.label }}</span>
        </div>
        <div class="text-lg font-semibold" :class="stat.color || 'text-white'">
          {{ stat.value }}
        </div>
      </div>
    </div>
  </div>
</template>
