<script lang="ts" setup>
/**
 * Bar-filled metric cell used in SiteGroup tables.
 * Renders a relative container with an absolute-positioned bar fill
 * that animates width, plus slotted content on top.
 */
defineProps<{
  /** Bar fill width as 0-100 */
  percent: number
  /** Tailwind bg class for the bar fill (e.g. from barColorMap or cwvBarColorMap) */
  barClass?: string
}>()
</script>

<template>
  <div class="relative flex items-center gap-3 cursor-default px-2 py-1">
    <!-- Bar fill animates via `transform: scaleX` (compositor-only) rather than
         `width` (which forces layout on every frame across all rows). The rounded
         corners live on a static full-width wrapper with `overflow-hidden`; the
         inner fill scales from the left edge so its corners never distort. -->
    <div
      v-if="percent > 0"
      class="absolute inset-y-0 left-0 w-full overflow-hidden rounded-md"
    >
      <div
        class="h-full w-full origin-left motion-safe:transition-transform motion-safe:duration-300"
        :class="barClass"
        :style="{ transform: `scaleX(${percent / 100})` }"
      />
    </div>
    <slot />
  </div>
</template>
