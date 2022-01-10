<script setup lang="ts">
import contributors from '../../contributors.json'
</script>

<template>
  <div class="flex flex-wrap gap-3 justify-center">
    <a v-for="c of contributors" :key="c" :href="`https://github.com/${c}`">
      <img :src="`https://github.com/${c}.png`"  class="rounded-full h-10 w-10">
    </a>
  </div>
</template>
