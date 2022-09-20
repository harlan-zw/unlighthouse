<script lang="ts" setup>
const props = defineProps<{
  selected?: boolean
}>()
</script>

<template>
<div class="flex items-center 2xl:(mb-1) focus:outline-none justify-between">
  <i-carbon-caret-right v-if="selected" class="inline text-sm opacity-80 mr-1" />
  <button
    class="focus:(outline-none ring-1) ring-offset-blue-400 ring-white ring-opacity-60 flex flex-col px-1 py-1 text-xs lg:(px-2 flex-row py-2 text-sm) items-center justify-between w-full leading-5 transition font-medium xl:text-base text-blue-700 rounded-lg"
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
