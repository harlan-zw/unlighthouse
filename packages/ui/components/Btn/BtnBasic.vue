<template>
  <button
    v-bind="$attrs"
    type="button"
    class="px-2 py-1 text-sm font-medium rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
  >
    <slot />
  </button>
</template>
