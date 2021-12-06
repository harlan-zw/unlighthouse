<script lang="ts" setup>
const isShowing = ref(false)
</script>
<template>
<div class="relative">
  <TransitionRoot
      appear
      :show="isShowing"
      as="template"
      enter="transform transition duration-[400ms]"
      enter-from="opacity-0 scale-50"
      enter-to="opacity-100 scale-100"
      leave="transform duration-200 transition ease-in-out"
      leave-from="opacity-100 scale-100 "
      leave-to="opacity-0 scale-95 "
  >
    <div role="tooltip" class="max-width-500px z-500 flex absolute min-w-200px z-10 top-[115%] inline-block bg-gray-900/99 font-medium shadow-sm text-white py-2 px-3 text-sm rounded-lg">
      <div>
        <slot name="tooltip"></slot>
      </div>
    </div>
  </TransitionRoot>
  <span @mouseenter="isShowing = true" @mouseleave="isShowing = false">
    <slot></slot>
  </span>
</div>
</template>
