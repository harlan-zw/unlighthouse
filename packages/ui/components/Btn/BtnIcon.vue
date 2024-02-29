<script>
export default {
  props: {
    href: {
      type: String,
      required: false,
    },
  },
}
</script>

<template>
  <a
    v-if="href"
    v-bind="$attrs"
    :href="href"
    class="inline-block cursor-pointer select-none !outline-none
    opacity-75 transition duration-200 ease-in-out
    hover:opacity-100 hover:text-teal-600 h-[1.2em] hover:no-underline no-underline"
  >
    <slot />
  </a>
  <button
    v-else
    v-bind="$attrs"
    class="inline-block cursor-pointer select-none !outline-none
    opacity-75 transition duration-200 ease-in-out
    hover:opacity-100 hover:text-teal-600 h-[1.2em] hover:no-underline no-underline"
  >
    <slot />
  </button>
</template>
