<script setup lang="ts">
import { searchText } from '../logic'
</script>

<template>
  <div class="group relative border border-main rounded outline-none! max-w-full" :class="[searchText.length > 0 ? 'dark:bg-teal-700 bg-blue-900 text-blue-300' : '']">
    <i-carbon-search class="text-sm mr-3 left-2 top-[50%] transform -translate-y-1/2 absolute opacity-75 group-focus:opacity-100" />
    <input
      v-model="searchText"
      type="text"
      class="bg-transparent border-transparent pl-7 py-1 rounded line-height-0.5 text-base w-full focus-visible:ring-teal-800"
      placeholder="Search routes"
      aria-label="Search lighthouse routes"
      aria-describedby="search-results-status"
    >
  </div>
</template>
