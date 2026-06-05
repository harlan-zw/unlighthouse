<script setup lang="ts">
defineProps<{
  message?: string
  description?: string
  ctaLabel?: string
  ctaTo?: string
}>()
</script>

<template>
  <div class="relative">
    <!-- Faded sample content. `inert` removes it from focus order AND the
         accessibility tree together — `aria-hidden` alone leaves any focusable
         children tabbable while hidden (a WCAG 4.1.2 violation). -->
    <div class="opacity-30 select-none" inert>
      <slot />
    </div>

    <!-- Overlay -->
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <div class="text-center px-4">
        <div class="inline-flex items-center justify-center size-10 rounded-xl bg-elevated border border-default mb-3">
          <UiIcon name="i-simple-icons-google" class="size-5 text-dimmed" />
        </div>
        <p class="text-sm font-medium text-default mb-1">
          {{ message || 'Preview' }}
        </p>
        <p class="text-xs text-muted mb-4">
          {{ description || 'Connect Google Search Console to see your real data.' }}
        </p>
        <UiButton
          v-if="ctaTo"
          :to="ctaTo"
          size="sm"
          purpose="secondary"
          icon="plug"
        >
          {{ ctaLabel || 'Connect GSC' }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
