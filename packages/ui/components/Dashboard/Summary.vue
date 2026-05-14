<script setup lang="ts">
const props = defineProps<{
  score: number | null
  stats: { label: string, value: string | number, color?: string, icon?: string }[]
}>()
</script>

<template>
  <div class="mb-6 p-4 rounded-sm bg-elevated/40 border border-default">
    <div class="flex items-center gap-6">
      <!-- Main Score -->
      <div class="flex items-center gap-4">
        <div class="relative">
          <UiProgressCircle :percent="score ?? 0" :size="64" :stroke-size="5" lighter />
          <div
            class="absolute inset-0 flex items-center justify-center font-mono text-xl font-bold numerals-display"
            :class="getScoreColor(score)"
          >
            {{ score ?? '-' }}
          </div>
        </div>
        <div>
          <div class="text-xs text-dimmed uppercase tracking-wider">
            Avg score
          </div>
          <div class="text-sm text-muted mt-0.5">
            <span v-if="score !== null && score >= 90" class="text-success">passing</span>
            <span v-else-if="score !== null && score >= 50" class="text-warning">needs work</span>
            <span v-else-if="score !== null" class="text-error">poor</span>
            <span v-else>no data</span>
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
            <div class="text-xs text-dimmed">
              {{ stat.label }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
