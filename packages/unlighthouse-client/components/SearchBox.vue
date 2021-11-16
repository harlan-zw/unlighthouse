<script setup lang="ts">
import { searchText } from '../logic'
</script>

<template>
<div class="group relative border border-main rounded bg-transparent !outline-none max-w-full">
  <i-carbon-search class="text-sm mr-3 left-1 top-[50%] transform -translate-y-1/2 absolute opacity-50 group-focus:opacity-100" />
  <input
      v-model="searchText"
      type="text"
      class="bg-transparent border-transparent pl-6 py-1 rounded text-sm w-200px focus-visible:ring-teal-800"
      placeholder="Search routes"
  />
</div>
</template>
