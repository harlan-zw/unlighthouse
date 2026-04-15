<script lang="ts" setup>
const isShowing = ref(false)
</script>

<template>
  <div v-if="$slots.tooltip" class="relative" @mouseleave="isShowing = false">
    <Transition
      appear
      enter-active-class="transform transition duration-400"
      enter-from-class="opacity-0 scale-50"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transform duration-200 transition ease-in-out"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div v-if="isShowing" role="tooltip" class="max-w-[500px] z-500 flex -left-[80px] absolute w-auto min-w-[320px] max-h-[500px] overflow-y-auto z-10 top-[99%] inline-block bg-gray-900/99 font-medium shadow-xs text-white py-2 px-3 text-sm rounded-lg">
        <div>
          <slot name="tooltip" />
        </div>
      </div>
    </Transition>
    <span @mouseenter="isShowing = true">
      <slot />
    </span>
  </div>
</template>
