<script>
export default {
  props: {
    features: {
      type: Array
    }
  }
}
</script>
<template>
<div class="grid gap-10 md:grid-cols-3 md:mt-10">
  <div v-for="(feat, i) in features" class="flex items-start">
    <span class="md:text-4xl text-2xl mr-5" v-html="feat.icon"></span>️
    <div>
      <h3 class="mt-0 text-xl">{{ feat.title }}</h3>
      <div v-html="feat.content">
      </div>
    </div>
  </div>
</div>
</template>
