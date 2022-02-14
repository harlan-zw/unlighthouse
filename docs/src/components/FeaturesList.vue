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
<div class="grid gap-10 grid-cols-3 mt-12">
  <div v-for="(feat, i) in features" class="flex items-start">
    <span class="text-4xl mr-5" v-html="feat.icon"></span>️
    <div>
      <h3 class="mt-0">{{ feat.title }}</h3>
      <div v-html="feat.content">
      </div>
    </div>
  </div>
</div>
</template>
