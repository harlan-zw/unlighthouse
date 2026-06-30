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
    <div class="opacity-25 select-none" inert>
      <slot />
    </div>

    <!-- Overlay -->
    <div class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[var(--ui-bg)]/70 via-[var(--ui-bg)]/95 to-[var(--ui-bg)]/75 backdrop-blur-[1px]">
      <div class="w-full max-w-md rounded-lg border border-default bg-default/90 px-5 py-4 text-center shadow-lg ring-1 ring-black/5 dark:ring-white/5">
        <div class="mb-3 inline-flex size-10 items-center justify-center rounded-lg border border-default bg-elevated">
          <UiIcon name="google" class="size-5 text-muted" aria-hidden="true" />
        </div>
        <p class="mb-1 text-sm font-semibold text-highlighted">
          {{ message || 'Preview' }}
        </p>
        <p class="mx-auto mb-4 max-w-sm text-sm leading-relaxed text-default">
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
