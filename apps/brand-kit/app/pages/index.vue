<script setup lang="ts">
useHead({ title: 'Brand Kit · Unlighthouse' })

const stats = [
  { label: 'Layer', value: '1', hint: 'packages/ui/layers/design-system (canonical)' },
  { label: 'Primitives', value: '40+', hint: 'element, container, data taxonomy' },
  { label: 'Consumer', value: 'packages/ui', hint: 'the Unlighthouse dashboard SPA' },
  { label: 'Palette', value: 'violet', hint: 'violet primary · slate neutral (hue 292)' },
]

const links = [
  { to: '/colors', label: 'Colors', icon: 'i-carbon-color-palette', blurb: 'Violet primary, warm slate neutral, semantic surfaces.' },
  { to: '/typography', label: 'Typography', icon: 'i-carbon-text-creation', blurb: 'Hubot Sans display + body.' },
  { to: '/buttons', label: 'Buttons', icon: 'i-carbon-cursor-1', blurb: 'UiButton — one primitive, semantic purpose prop, curated icons.' },
  { to: '/forms', label: 'Forms', icon: 'i-carbon-edit', blurb: 'Inputs, textareas, selects, switches.' },
  { to: '/status', label: 'Status & indicators', icon: 'i-carbon-circle-packing', blurb: 'UiStatusBadge, UiChip, dots, UiTrend, UiAlert — the color-budget ladder.' },
  { to: '/skeleton', label: 'Skeleton', icon: 'i-carbon-skill-level-basic', blurb: 'UiSkeleton — text, bar, circle loading shapes.' },
  { to: '/cards', label: 'Cards', icon: 'i-carbon-template', blurb: 'UCard, UPageCard, UiCard, MetricCard.' },
  { to: '/elements', label: 'Elements', icon: 'i-carbon-cube', blurb: 'UiNavIcon, UiHelpLabel, UiProgressCircle.' },
  { to: '/tooltip', label: 'Tooltip', icon: 'i-carbon-information', blurb: 'UiTooltip + UiTooltipGrid for dense delegated grids.' },
  { to: '/popover', label: 'Popover', icon: 'i-carbon-menu', blurb: 'UiPopover, UDropdownMenu, USelectMenu.' },
  { to: '/charts', label: 'Charts', icon: 'i-carbon-chart-line', blurb: 'UiChartFrame, UiSparkline, UiChartTooltip.' },
  { to: '/data-cells', label: 'Table cells', icon: 'i-carbon-grid', blurb: 'TableMetricCell, TablePathCell, TableTrendCell, TableScoreTile.' },
  { to: '/tables', label: 'Data tables', icon: 'i-carbon-table', blurb: 'UiTable, UiTableShell.' },
  { to: '/filters', label: 'Filtering', icon: 'i-carbon-filter', blurb: 'UiPillSelect and filter affordances.' },
]
</script>

<template>
  <div class="space-y-10">
    <section class="-mx-6 -mt-8 px-6 pt-12 pb-10 border-b border-default rounded-b-2xl bg-muted">
      <div class="space-y-3 max-w-3xl">
        <div class="flex items-center gap-2">
          <UiChip purpose="brand">
            violet
          </UiChip>
          <UiChip purpose="tag">
            warm slate
          </UiChip>
        </div>
        <h1 class="text-5xl font-semibold tracking-tight text-highlighted leading-[1.05]">
          Unlighthouse Design System
        </h1>
        <p class="text-lg text-muted">
          The design-system layer is the canonical source. The Unlighthouse dashboard SPA consumes its primitives, tokens, and motion from here.
        </p>
        <div class="flex flex-wrap gap-2 pt-2">
          <UiButton to="/colors" purpose="secondary" trailing-icon="i-carbon-arrow-right">
            Open the system
          </UiButton>
          <UiButton to="/buttons" purpose="secondary" icon="i-carbon-star">
            See motion
          </UiButton>
        </div>
      </div>
    </section>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <UiCard v-for="s in stats" :key="s.label">
        <div class="space-y-1">
          <div class="numerals-display text-3xl text-highlighted">
            {{ s.value }}
          </div>
          <div class="text-xs text-default font-medium">
            {{ s.label }}
          </div>
          <div class="text-[10px] text-dimmed font-mono truncate">
            {{ s.hint }}
          </div>
        </div>
      </UiCard>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <NuxtLink
        v-for="l in links"
        :key="l.to"
        :to="l.to"
        class="group block"
      >
        <UiCard class="h-full transition-all group-hover:ring-primary-500/40">
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <UIcon :name="l.icon" class="size-4 text-primary-500" />
              <div class="font-medium text-highlighted">
                {{ l.label }}
              </div>
            </div>
            <p class="text-sm text-muted">
              {{ l.blurb }}
            </p>
          </div>
        </UiCard>
      </NuxtLink>
    </div>
  </div>
</template>
