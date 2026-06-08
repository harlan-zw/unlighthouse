<script setup lang="ts">
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Components"
      title="Elements"
      description="Small design-system primitives — nav icon containers, progress circles, and help labels."
    />

    <KitSection title="Nav icons · semantic variants" code="<UiNavIcon>">
      <div class="flex flex-wrap items-center gap-3">
        <UiNavIcon icon="i-carbon-rocket" />
        <UiNavIcon icon="i-carbon-checkmark" variant="success" />
        <UiNavIcon icon="i-carbon-warning" variant="warning" />
        <UiNavIcon icon="i-carbon-close" variant="error" />
        <UiNavIcon icon="i-carbon-information" variant="info" />
        <UiNavIcon icon="i-carbon-chart-line" variant="experimental" />
        <UiNavIcon icon="i-carbon-locked" :locked="true" />
        <UiNavIcon icon="i-carbon-renew" :loading="true" />
      </div>
    </KitSection>

    <KitSection title="Progress circles" code="<UiProgressCircle>">
      <div class="flex flex-wrap items-center gap-5">
        <UiProgressCircle :percent="32" label="Scan progress" />
        <UiProgressCircle :percent="68" label="Scan progress" />
        <UiProgressCircle :percent="94" label="Scan progress" />
        <UiProgressCircle :percent="58" :size="56" :stroke-size="6" lighter label="Scan progress" />
      </div>
    </KitSection>

    <KitSection title="Help label" code="<UiHelpLabel>">
      <UiHelpLabel label="Scanned routes" help="Routes discovered and audited in the latest crawl." />
    </KitSection>
  </div>
</template>
