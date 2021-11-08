<script setup lang="ts">
import { searchText } from '../logic'
</script>

<template>
  <input
    v-model="searchText"
    type="text"
    class="border border-main px-2 py-0 rounded bg-transparent !outline-none max-w-full"
    placeholder="Search..."
  />
</template>
