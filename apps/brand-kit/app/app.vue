<script setup lang="ts">
import { domAnimation, LazyMotion, MotionConfig } from 'motion-v'
import { ConfigProvider } from 'reka-ui'

// Mirrors apps/pro/app/app.vue — the LazyMotion feature provider is required
// for UiButton's `<m.div>` hover/press FX to actually animate.
const useIdFunction = () => useId()
</script>

<template>
  <ConfigProvider :use-id="useIdFunction">
    <LazyMotion :features="domAnimation">
      <MotionConfig reduced-motion="user">
        <UApp :tooltip="{ delayDuration: 0 }">
          <NuxtLayout>
            <NuxtPage />
          </NuxtLayout>
        </UApp>
      </MotionConfig>
    </LazyMotion>
  </ConfigProvider>
</template>
