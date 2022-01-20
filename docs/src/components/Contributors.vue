<script setup lang="ts">
import contributors from '../../contributors.json'
</script>

<template>
  <div class="flex flex-wrap gap-5 justify-center">
    <a v-for="c of contributors" :key="c" :href="`https://github.com/${c}`">
      <img :src="`https://github.com/${c}.png`"  class="rounded-full h-18 w-18">
    </a>
  </div>
</template>
