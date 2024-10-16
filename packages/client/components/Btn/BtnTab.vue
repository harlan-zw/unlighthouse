<script lang="ts" setup>
defineProps<{
  selected?: boolean
}>()
</script>

<template>
  <div class="flex items-center focus:outline-none justify-between">
    <button
      class="space-x-2 focus:(outline-none ring-1) ring-offset-blue-400 ring-white ring-opacity-60 flex flex-col text-xs lg:(px-2 flex-row py-1 text-sm) items-center justify-between w-full leading-5 transition font-medium text-blue-700 rounded-lg "
      :class="[
        selected
          ? 'bg-blue-900 text-blue-200 shadow'
          : 'dark:(text-blue-100 hover:bg-white/[0.12] hover:text-white) text-blue-900/70 hover:(bg-blue-200)',
      ]"
    >
      <slot />
    </button>
  </div>
</template>
