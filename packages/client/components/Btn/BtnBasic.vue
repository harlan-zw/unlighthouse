<template>
  <button
    v-bind="$attrs"
    type="button"
    class="padding-sm text-sm font-medium rounded-md btn-focus"
  >
    <slot />
  </button>
</template>
