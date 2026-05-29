<script setup lang="ts">
</script>

<template>
  <div class="space-y-10">
    <KitHeader eyebrow="Components" title="Cards & surfaces" />

    <KitSection title="UCard variants">
      <div class="grid md:grid-cols-3 gap-3">
        <UiCard>
          <div class="space-y-1">
            <div class="font-medium text-highlighted">
              Outline
            </div>
            <p class="text-sm text-muted">
              ring-default + bg-muted
            </p>
          </div>
        </UiCard>
        <UiCard>
          <div class="space-y-1">
            <div class="font-medium text-highlighted">
              Soft
            </div>
            <p class="text-sm text-muted">
              bg-muted/50
            </p>
          </div>
        </UiCard>
        <UiCard variant="subtle">
          <div class="space-y-1">
            <div class="font-medium text-highlighted">
              Subtle
            </div>
            <p class="text-sm text-muted">
              bg-muted + ring-default
            </p>
          </div>
        </UiCard>
      </div>
    </KitSection>

    <KitSection title="Marketing card patterns" description="Components in app/components — flagged for consolidation in the audit.">
      <div class="grid md:grid-cols-2 gap-3">
        <UiCard>
          <div class="text-sm text-muted">
            CardLinks · ModuleFeaturesCard · ShowcaseCard · ReviewCard · ModuleCardComingSoon
          </div>
        </UiCard>
        <UiCard>
          <div class="text-sm text-muted">
            ProBriefCard · ProCard · ProCardSection · ProCardGsc · ProCardIndexing · ProMetricCard
          </div>
        </UiCard>
      </div>
    </KitSection>
  </div>
</template>
