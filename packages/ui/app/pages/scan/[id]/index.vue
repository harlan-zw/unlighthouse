<script setup lang="ts">
const route = useRoute()
const scanId = route.params.id as string

navigateTo(`/scan/${scanId}/overview`, { replace: true })
</script>

<template>
  <div />
</template>
