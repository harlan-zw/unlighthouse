<script setup lang="ts">
defineProps<{
  avatar: string
  name: string
  github: string
  twitter?: string
  sponsors?: boolean
}>()
</script>

<template>
<div class="text-center">
  <img :src="avatar" class="mx-auto rounded-full h-25 w-25">
  <div class="text-xl mt-1 mb-1">
    {{ name }}
  </div>
  <div class="op60">
    <slot />
  </div>
  <div class="py-4 flex items-center justify-center gap-4 text-2xl">
    <a :href="`https://github.com/${github}`"
       target="_blank">
      <i-carbon-logo-github
          class="inline-block text-current op30 hover:op100 mya transition duration-200"
      />
    </a>
    <a :href="`https://twitter.com/${twitter}`"
       target="_blank">
      <i-carbon-logo-twitter
          v-if="twitter"
          class="inline-block text-1.3em mya text-current op30 hover:op100 transition duration-200"
      />
    </a>
  </div>
  <br>
  <btn-basic
      v-if="sponsors"
      class="text-white mt-1 bg-pink-500 hover:bg-pink-600"
      target="_blank"
      :href="`https://github.com/sponsors/${github}`"
  >
    <i-carbon-favorite-filled class="inline-block" />
    Sponsor
  </btn-basic>
</div>
</template>
