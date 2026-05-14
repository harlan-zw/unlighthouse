<script setup lang="ts">
import { domAnimation, LazyMotion, MotionConfig } from 'motion-v'
</script>

<template>
  <LazyMotion :features="domAnimation">
    <MotionConfig reduced-motion="user">
      <UApp :tooltip="{ delayDuration: 0 }">
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </UApp>
    </MotionConfig>
  </LazyMotion>
</template>
