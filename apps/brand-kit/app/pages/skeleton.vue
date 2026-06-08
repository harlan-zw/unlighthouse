<script lang="ts" setup>
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Components"
      title="Skeleton"
      description="Loading placeholders. Polish targets: shimmer cadence, content-shape matching, stagger curve, reduced-motion fallback."
    />

    <KitSection title="Text · single + multi-line">
      <div class="grid grid-cols-2 gap-4">
        <div class="border border-default rounded-md p-4 space-y-3">
          <div class="text-[10px] uppercase tracking-wider text-dimmed">
            Single
          </div>
          <UiSkeleton type="text" :base="180" :range="40" />
        </div>
        <div class="border border-default rounded-md p-4 space-y-3">
          <div class="text-[10px] uppercase tracking-wider text-dimmed">
            Lines=4 (staggered widths)
          </div>
          <UiSkeleton type="text" :lines="4" :base="200" :range="80" />
        </div>
      </div>
    </KitSection>

    <KitSection title="Card-shaped (metric placeholder)">
      <div class="grid grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="border border-default rounded-xl p-4 space-y-3 min-h-[5.5rem]">
          <UiSkeleton type="text" :index="i" :base="60" :range="20" />
          <UiSkeleton type="text" :index="i + 10" :base="80" :range="30" class="!h-7" />
          <UiSkeleton type="text" :index="i + 20" :base="100" :range="20" />
        </div>
      </div>
    </KitSection>

    <KitSection title="Bar chart placeholder">
      <div class="border border-default rounded-md p-6">
        <div class="flex items-end gap-1 h-32">
          <UiSkeleton v-for="i in 24" :key="i" type="bar" :index="i" class="flex-1" />
        </div>
      </div>
    </KitSection>

    <KitSection title="Table row placeholder">
      <div class="border border-default rounded-md overflow-hidden">
        <div class="grid grid-cols-[1fr_80px_100px_60px_80px] gap-3 px-4 py-3 border-b border-default text-[10px] uppercase tracking-wider text-dimmed">
          <span>Query</span>
          <span class="text-right">Clicks</span>
          <span class="text-right">Impressions</span>
          <span class="text-right">CTR</span>
          <span class="text-right">Position</span>
        </div>
        <div v-for="i in 6" :key="i" class="grid grid-cols-[1fr_80px_100px_60px_80px] gap-3 px-4 py-3 border-b border-default last:border-0 items-center">
          <UiSkeleton type="text" :index="i" :base="160" :range="80" />
          <UiSkeleton type="text" :index="i + 10" :base="40" :range="20" class="ml-auto" />
          <UiSkeleton type="text" :index="i + 20" :base="50" :range="20" class="ml-auto" />
          <UiSkeleton type="text" :index="i + 30" :base="30" :range="10" class="ml-auto" />
          <UiSkeleton type="text" :index="i + 40" :base="30" :range="10" class="ml-auto" />
        </div>
      </div>
    </KitSection>

    <KitSection title="Circle (avatar / icon placeholder)">
      <div class="border border-default rounded-md p-6 flex items-center gap-3">
        <UiSkeleton type="circle" :base="40" />
        <UiSkeleton type="circle" :base="32" />
        <UiSkeleton type="circle" :base="24" />
        <UiSkeleton type="circle" :base="16" />
      </div>
    </KitSection>

    <KitSection title="Complex composition · stat card shape">
      <div class="grid grid-cols-3 gap-4">
        <div v-for="i in 3" :key="i" class="border border-default rounded-xl p-4 space-y-3 min-h-[7rem]">
          <div class="flex items-center gap-2">
            <UiSkeleton type="circle" :base="14" />
            <UiSkeleton type="text" :index="i" :base="80" :range="20" />
          </div>
          <UiSkeleton type="text" :index="i + 5" :base="100" :range="20" class="!h-8" />
          <UiSkeleton type="text" :index="i + 10" :base="140" :range="40" />
        </div>
      </div>
    </KitSection>
  </div>
</template>
