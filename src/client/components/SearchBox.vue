<script setup lang="ts">
import { searchText } from '../logic'
</script>

<template>
  <input
    v-model="searchText"
    type="text"
    class="border border-main px-3 py-1 rounded bg-transparent !outline-none"
    placeholder="Search..."
  />
</template>
