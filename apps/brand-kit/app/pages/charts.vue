<script setup lang="ts">
import { computed } from 'vue'

// Seeded synthetic fixtures so the chart primitives can be exercised against
// every shape the real cards encounter: single metric, multi-metric, with
// comparison, with estimated badge, short period (≤10d), long period (>120d).

interface Row { date: string, values: number[], prev?: number[] | null }

function isoDaysBefore(today: Date, daysAgo: number): string {
  const d = new Date(today)
  d.setDate(today.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function seededWave(n: number, opts: { amp: number, period: number, phase: number, trend: number, base: number, noise?: number }): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1)
    const wave = Math.sin((t + opts.phase) * Math.PI * 2 * opts.period) * opts.amp
    const trend = t * opts.trend
    const noise = opts.noise ? Math.sin(i * 13.37 + opts.phase * 7) * opts.noise : 0
    out.push(Math.max(0, Math.round(opts.base + trend + wave + noise)))
  }
  return out
}

const TODAY = new Date('2026-05-26T00:00:00')

function buildSeries(days: number, perMetricOpts: Parameters<typeof seededWave>[1][], withPrev = false): Row[] {
  const cols = perMetricOpts.map(o => seededWave(days, o))
  const prevCols = withPrev ? perMetricOpts.map(o => seededWave(days, { ...o, base: o.base * 0.85, trend: o.trend * 0.6 })) : null
  const rows: Row[] = []
  for (let i = 0; i < days; i++) {
    rows.push({
      date: isoDaysBefore(TODAY, days - 1 - i),
      values: cols.map(c => c[i]!),
      prev: prevCols ? prevCols.map(c => c[i]!) : null,
    })
  }
  return rows
}

// --- single metric, 90 days ---
const single90 = computed(() => buildSeries(90, [
  { amp: 30, period: 4, phase: 0, trend: 60, base: 50, noise: 12 },
]))

// --- multi-metric, 90 days, with comparison ---
const multi90Cmp = computed(() => buildSeries(90, [
  { amp: 40, period: 3, phase: 0, trend: 80, base: 120, noise: 15 },
  { amp: 90, period: 3, phase: 0.1, trend: 200, base: 400, noise: 35 },
  { amp: 20, period: 4, phase: 0.3, trend: 30, base: 60, noise: 8 },
], true))

// --- single metric, 90 days, with "Estimated" tail badge ---
const single90Est = computed(() => buildSeries(90, [
  { amp: 25, period: 5, phase: 0.2, trend: 50, base: 80, noise: 10 },
]))

// --- short period (7 days) ---
const short7 = computed(() => buildSeries(7, [
  { amp: 8, period: 1, phase: 0, trend: 12, base: 40, noise: 4 },
]))

// --- long period (180 days) ---
const long180 = computed(() => buildSeries(180, [
  { amp: 20, period: 6, phase: 0, trend: 100, base: 200, noise: 18 },
]))

const PRIMARY = { color: 'rgba(59,130,246,0.9)', gradientStop: 'rgba(59,130,246,0.25)' }
const VIOLET = { color: 'rgba(168,85,247,0.85)', gradientStop: 'rgba(168,85,247,0.2)' }
const TEAL = { color: 'rgba(6,182,212,0.9)', gradientStop: 'rgba(6,182,212,0.22)' }

const singleMetric = [{ key: 'v', label: 'Value', ...PRIMARY }]
const multiMetric = [
  { key: 'clicks', label: 'Clicks', ...PRIMARY },
  { key: 'impressions', label: 'Impressions', ...VIOLET },
  { key: 'users', label: 'Users', ...TEAL },
]
</script>

<template>
  <div class="space-y-10">
    <KitHeader eyebrow="Data" title="Charts" />

    <KitSection title="Single metric · 90 days">
      <UiCard>
        <p class="text-xs text-dimmed mb-3">
          Baseline — exercises <code>useChartBrush</code>, <code>useChartHover</code>, <code>useChartTickPlan</code>
          (≤120-day tick branch). One row tooltip → no dot, no header strip.
        </p>
        <KitChartDemo :data="single90" :metrics="singleMetric" />
      </UiCard>
    </KitSection>

    <KitSection title="Multi-metric · 90 days · with comparison">
      <UiCard>
        <p class="text-xs text-dimmed mb-3">
          Three metrics → tooltip rows get color dots. Prev series enabled → dashed comparison lines + <code>tooltip-footer</code> slot renders the prev date.
        </p>
        <KitChartDemo :data="multi90Cmp" :metrics="multiMetric" show-comparison />
      </UiCard>
    </KitSection>

    <KitSection title="Estimated data badge">
      <UiCard>
        <p class="text-xs text-dimmed mb-3">
          Mirrors the GSC card's "Estimated" header strip. The <code>tooltip-header</code> slot only renders the warning chip — no duplicate date.
        </p>
        <KitChartDemo :data="single90Est" :metrics="singleMetric" estimated />
      </UiCard>
    </KitSection>

    <KitSection title="Short period · 7 days">
      <UiCard>
        <p class="text-xs text-dimmed mb-3">
          Tick plan switches to per-day labels (<code>weekday + day</code>). Brush still works on tight ranges.
        </p>
        <KitChartDemo :data="short7" :metrics="singleMetric" />
      </UiCard>
    </KitSection>

    <KitSection title="Long period · 180 days">
      <UiCard>
        <p class="text-xs text-dimmed mb-3">
          Tick plan switches to first-of-month with thinning. The year suffix shows on January / first-tick.
        </p>
        <KitChartDemo :data="long180" :metrics="singleMetric" />
      </UiCard>
    </KitSection>

    <KitSection title="Pro graph primitives">
      <UiCard>
        <div class="text-sm text-muted space-y-1">
          <div>ProGraphCwv · ProGraphGsc · ProGraphIndexing · ProGraphDataforseo</div>
          <div>ProTopPagesChart · ProBrandTrafficChart · ProCwvMetricChart</div>
          <div class="text-xs text-dimmed">
            Live previews require Pro layer data wiring. See the audit report for the consolidation plan.
          </div>
        </div>
      </UiCard>
    </KitSection>
  </div>
</template>
