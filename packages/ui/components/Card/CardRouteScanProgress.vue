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
      <div class="mr-15">
        <div class="mb-2">
          <div class="text-xs uppercase opacity-40">
            Static Routes
          </div> {{ stats.staticRoutes }}
        </div>
        <div v-if="stats.dynamicRoutes" class="mb-2">
          <div class="text-xs uppercase opacity-40">
            Dynamic Routes
          </div> {{ stats.dynamicRoutes }}
        </div>
      </div>
      <div>
        <metric-guage :score="stats.score" label="Site Score" />
      </div>
    </div>
  </card>
</template>
