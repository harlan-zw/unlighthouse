<script lang="ts" setup>
import type { ColumnDef } from '@tanstack/vue-table'

interface RouteRow {
  route: string
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
  lcp: number
}

const rows: RouteRow[] = [
  { route: '/', performance: 98, accessibility: 100, bestPractices: 100, seo: 100, lcp: 1.2 },
  { route: '/docs', performance: 92, accessibility: 96, bestPractices: 100, seo: 100, lcp: 1.8 },
  { route: '/docs/getting-started', performance: 88, accessibility: 96, bestPractices: 92, seo: 100, lcp: 2.1 },
  { route: '/integrations', performance: 74, accessibility: 91, bestPractices: 92, seo: 92, lcp: 3.0 },
  { route: '/integrations/ci', performance: 81, accessibility: 96, bestPractices: 100, seo: 100, lcp: 2.4 },
  { route: '/api', performance: 67, accessibility: 88, bestPractices: 85, seo: 92, lcp: 3.6 },
  { route: '/blog', performance: 95, accessibility: 100, bestPractices: 100, seo: 100, lcp: 1.4 },
  { route: '/blog/v1-release', performance: 90, accessibility: 96, bestPractices: 92, seo: 100, lcp: 1.9 },
  { route: '/pricing', performance: 84, accessibility: 91, bestPractices: 100, seo: 92, lcp: 2.2 },
  { route: '/changelog', performance: 96, accessibility: 100, bestPractices: 100, seo: 100, lcp: 1.3 },
]

const columns: ColumnDef<RouteRow>[] = [
  { accessorKey: 'route', header: 'Route' },
  { accessorKey: 'performance', header: 'Performance' },
  { accessorKey: 'accessibility', header: 'Accessibility' },
  { accessorKey: 'bestPractices', header: 'Best Practices' },
  { accessorKey: 'seo', header: 'SEO' },
  { accessorKey: 'lcp', header: 'LCP (s)' },
]
const emptyRows: RouteRow[] = []
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Data"
      title="Data tables"
      description="UiTable — TanStack-backed primitive. UTable (Nuxt UI) and the scan table shells layer on top."
    />

    <KitSection title="Default · sortable · 10 rows">
      <div class="border border-default rounded-md overflow-hidden">
        <UiTable :data="rows" :columns="columns" :enable-sorting="true" :page-size="10" />
      </div>
    </KitSection>

    <KitSection title="Row hover + clickable rows">
      <div class="border border-default rounded-md overflow-hidden">
        <UiTable :data="rows" :columns="columns" :row-hover="true" :row-clickable="true" :enable-sorting="true" :page-size="10" />
      </div>
    </KitSection>

    <KitSection title="Size variants" code="size=xs|sm|md">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="border border-default rounded-md overflow-hidden">
          <div class="text-[10px] uppercase tracking-wider text-dimmed px-3 pt-2">
            size="sm"
          </div>
          <UiTable :data="rows.slice(0, 5)" :columns="columns" size="sm" :page-size="5" :disable-pagination="true" />
        </div>
        <div class="border border-default rounded-md overflow-hidden">
          <div class="text-[10px] uppercase tracking-wider text-dimmed px-3 pt-2">
            size="md"
          </div>
          <UiTable :data="rows.slice(0, 5)" :columns="columns" size="md" :page-size="5" :disable-pagination="true" />
        </div>
        <div class="border border-default rounded-md overflow-hidden">
          <div class="text-[10px] uppercase tracking-wider text-dimmed px-3 pt-2">
            size="xs"
          </div>
          <UiTable :data="rows.slice(0, 5)" :columns="columns" size="xs" :page-size="5" :disable-pagination="true" />
        </div>
      </div>
    </KitSection>

    <KitSection title="Loading state · staggered skeletons">
      <div class="border border-default rounded-md overflow-hidden">
        <UiTable :data="[]" :columns="columns" :loading="true" :loading-rows="6" />
      </div>
    </KitSection>

    <KitSection title="Empty state">
      <div class="border border-default rounded-md overflow-hidden">
        <UiTable :data="emptyRows" :columns="columns" />
      </div>
    </KitSection>
  </div>
</template>
