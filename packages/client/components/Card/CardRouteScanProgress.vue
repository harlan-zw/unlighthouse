<script lang="ts" setup>
defineProps<{
  stats: {
    staticRoutes: number
    dynamicRoutes: number
    runtimeModuleCount: number
    buildModuleCount: number
    score: number
  }
}>()
</script>

<template>
  <card>
    <div class="flex items-center">
      <div class="mr-15 space-y-3">
        <stat-item
          label="Static Routes"
          :value="stats.staticRoutes"
          size="md"
        />
        <stat-item
          v-if="stats.dynamicRoutes"
          label="Dynamic Routes"
          :value="stats.dynamicRoutes"
          size="md"
        />
      </div>
      <div>
        <metric-guage :score="stats.score" label="Site Score" />
      </div>
    </div>
  </card>
</template>
