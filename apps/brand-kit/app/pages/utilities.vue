<script setup lang="ts">
</script>

<template>
  <div class="space-y-10">
    <KitHeader eyebrow="Foundation" title="Utilities" />
    <KitSection title="Easings">
      <ul class="text-sm text-muted space-y-1 font-mono">
        <li>--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)</li>
        <li>--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)</li>
        <li>--ease-exit: cubic-bezier(0.4, 0, 1, 1)</li>
      </ul>
    </KitSection>
    <KitSection title="Density">
      <ul class="text-sm text-muted space-y-1 font-mono">
        <li>--density-card-padding</li>
        <li>--density-element-gap</li>
        <li>--density-section-gap</li>
      </ul>
    </KitSection>
  </div>
</template>
