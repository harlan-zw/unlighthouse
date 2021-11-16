<script lang="ts" setup>
const props = defineProps<{
  stats: {
    framework: {
      version: string
      name: string
      id: string
    }[]
  }
}>()
</script>
<template>
  <card>
    <div class="flex items-center">
      <div v-for="(framework, key) in stats.framework" :key="key" class="mr-15">
        <div class="text-xs uppercase opacity-40">
          {{ framework.version }}
        </div>
        <i-logos-nuxt-icon v-if="framework.id === 'nuxt'" class="h-30px inline mr-1" />
        <i-logos-vue v-else-if="framework.id === 'vue'" class="h-30px inline mr-1" />
        <span class="text-sm">
          {{ framework.name }}
        </span>
      </div>
    </div>
  </card>
</template>
