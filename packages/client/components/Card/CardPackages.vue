<script lang="ts" setup>
defineProps<{
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
        <UIcon v-if="framework.id === 'nuxt'" name="i-logos-nuxt-icon" class="h-[30px] inline mr-1" />
        <UIcon v-else-if="framework.id === 'vue'" name="i-logos-vue" class="h-[30px] inline mr-1" />
        <span class="text-sm">
          {{ framework.name }}
        </span>
      </div>
    </div>
  </card>
</template>
