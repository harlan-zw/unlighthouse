<script setup lang="ts">
import type { SemanticStatus } from '#design-system/app/composables/semanticColors'

const statuses: SemanticStatus[] = ['success', 'warning', 'error', 'info', 'neutral']

const statusIcon: Record<SemanticStatus, string> = {
  success: 'i-carbon-checkmark',
  warning: 'i-carbon-warning',
  error: 'i-carbon-warning-alt',
  info: 'i-carbon-information',
  neutral: 'i-carbon-circle-dash',
}

// A realistic repeated-status list (indexing report). Mostly the expected
// "Indexed" state, with one warning + one error — the case the color budget
// has to survive.
const rows = [
  { page: '/blog/seo-guide', status: 'success' as const, state: 'Indexed' },
  { page: '/blog/nuxt-tips', status: 'success' as const, state: 'Indexed' },
  { page: '/products/pro', status: 'warning' as const, state: 'Crawled, not indexed' },
  { page: '/about', status: 'success' as const, state: 'Indexed' },
  { page: '/legacy/old', status: 'error' as const, state: 'Excluded — noindex' },
  { page: '/docs/api', status: 'success' as const, state: 'Indexed' },
  { page: '/pricing', status: 'success' as const, state: 'Indexed' },
]

const alertIcon: Record<string, string> = {
  error: 'i-lucide-circle-alert',
  warning: 'i-lucide-triangle-alert',
  success: 'i-lucide-circle-check',
  info: 'i-lucide-info',
}
const alerts = [
  { color: 'error' as const, title: 'Search Console disconnected', body: 'Token revoked 2 days ago. Reconnect to resume sync.' },
  { color: 'warning' as const, title: 'Sitemap is 80% of quota', body: '4,012 of 5,000 URLs submitted this month.' },
  { color: 'info' as const, title: 'New CrUX field data', body: 'Real-user metrics refreshed for the last 28 days.' },
  { color: 'success' as const, title: 'Crawl complete', body: 'No broken internal links found.' },
]
</script>

<template>
  <div class="space-y-12">
    <KitHeader
      eyebrow="Components"
      title="Status & indicators"
      description="Badges, chips, dots, trends and alerts — the semantic-status family. Color is a signal with a fixed attention budget: painting every expected state (Indexed, Ready, Passing) spends it on non-events, so the row that needs attention can't stand out. We spend color only where it earns its place — the color-budget ladder below."
    />

    <!-- ── The color-budget problem ── -->
    <KitSection
      title="The problem: color doesn't scale with count"
      description="Same data, same semantics. Left spends color on every row; right spends it only on the dot. Scan each for the one page that needs you — count how long it takes."
    >
      <div class="grid lg:grid-cols-2 gap-4">
        <!-- A: tinted fill -->
        <div class="rounded-xl border border-default overflow-hidden">
          <div class="px-4 py-2.5 border-b border-default flex items-center justify-between">
            <span class="text-xs font-medium text-default">Tinted chip per row</span>
            <span class="text-mini uppercase tracking-wider text-error">7 colored fills</span>
          </div>
          <div class="divide-y divide-[var(--ui-border)]">
            <div v-for="r in rows" :key="r.page" class="flex items-center justify-between gap-3 px-4 py-2">
              <span class="font-mono text-xs text-muted truncate">{{ r.page }}</span>
              <UiChip purpose="status" :status="r.status">
                {{ r.state }}
              </UiChip>
            </div>
          </div>
        </div>
        <!-- B: dot + neutral -->
        <div class="rounded-xl border border-default overflow-hidden">
          <div class="px-4 py-2.5 border-b border-default flex items-center justify-between">
            <span class="text-xs font-medium text-default">UiStatusBadge default (dot + neutral)</span>
            <span class="text-mini uppercase tracking-wider text-dimmed">2 colored dots</span>
          </div>
          <div class="divide-y divide-[var(--ui-border)]">
            <div v-for="r in rows" :key="r.page" class="flex items-center justify-between gap-3 px-4 py-2">
              <span class="font-mono text-xs text-muted truncate">{{ r.page }}</span>
              <UiStatusBadge :status="r.status" :label="r.state" />
            </div>
          </div>
        </div>
      </div>
    </KitSection>

    <!-- ── Alerts ── -->
    <KitSection
      title="Alerts"
      code="<UiAlert :color :title :description :icon dismissible>"
      description="Same color budget. UiAlert keeps a neutral surface for every color — the semantic accent rides the icon + top bar + corner bloom only — so stacked alerts read by severity without competing for the surface."
    >
      <div class="space-y-2">
        <UiAlert v-for="a in alerts" :key="a.title" :status="a.color" :title="a.title" :description="a.body" :icon="alertIcon[a.color]" />
      </div>
    </KitSection>

    <!-- ── The ladder ── -->
    <KitSection
      title="Color-budget ladder"
      description="Color budget scales inversely with how many you put on screen. The more instances, the less color each one spends."
    >
      <div class="space-y-3">
        <div class="flex items-start gap-4 rounded-lg border border-default p-4">
          <div class="w-44 shrink-0">
            <div class="text-xs font-medium text-default">
              Repeated (≥3 / tables)
            </div>
            <div class="text-mini text-dimmed">
              UiStatusBadge (default)
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-4 text-xs">
            <UiStatusBadge status="success" label="Indexed" />
            <UiStatusBadge status="warning" label="Pending" />
            <UiStatusBadge status="error" label="Excluded" />
            <span class="text-dimmed">— color = a 6px dot, text stays neutral</span>
          </div>
        </div>
        <div class="flex items-start gap-4 rounded-lg border border-default p-4">
          <div class="w-44 shrink-0">
            <div class="text-xs font-medium text-default">
              Singular emphasis (1)
            </div>
            <div class="text-mini text-dimmed">
              UiStatusBadge prominent
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UiStatusBadge status="error" label="Excluded — noindex" :icon="statusIcon.error" prominent />
            <span class="text-xs text-dimmed">— tinted fill, fine when it's the only one</span>
          </div>
        </div>
        <div class="flex items-start gap-4 rounded-lg border border-default p-4">
          <div class="w-44 shrink-0">
            <div class="text-xs font-medium text-default">
              Page-level / blocking
            </div>
            <div class="text-mini text-dimmed">
              UiAlert
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <UiAlert status="error" title="Search Console disconnected" description="Reconnect to resume sync." icon="i-lucide-circle-alert" />
          </div>
        </div>
      </div>
    </KitSection>

    <!-- ── Purpose-driven catalogue ── -->
    <KitSection
      title="Chip — aligned to UiButton"
      code="<UiChip :purpose :status>"
      description="One semantic knob, like UiButton. No raw variant/color: each purpose pins a fixed treatment. status↔(data), count↔secondary, tag↔quiet, accent↔cta."
    >
      <div class="space-y-6">
        <KitRow label="status">
          <UiChip v-for="s in statuses" :key="s" purpose="status" :status="s">
            {{ s }}
          </UiChip>
        </KitRow>
        <KitRow label="status + icon">
          <UiChip v-for="s in statuses" :key="s" purpose="status" :status="s" :icon="statusIcon[s]">
            {{ s }}
          </UiChip>
        </KitRow>
        <KitRow label="count">
          <UiChip purpose="count">
            128
          </UiChip>
          <UiChip purpose="count" tabular>
            1,234
          </UiChip>
        </KitRow>
        <KitRow label="tag">
          <UiChip purpose="tag">
            keyword
          </UiChip>
          <UiChip purpose="tag" label="position" removable>
            position 11–20
          </UiChip>
          <UiChip purpose="tag" mono>
            sc-domain:example.com
          </UiChip>
        </KitRow>
        <KitRow label="accent">
          <UiChip purpose="accent">
            NEW
          </UiChip>
          <UiChip purpose="accent">
            Latest
          </UiChip>
        </KitRow>
        <KitRow label="brand">
          <UiChip purpose="brand">
            Pro
          </UiChip>
          <UiChip purpose="brand">
            Most popular
          </UiChip>
        </KitRow>
      </div>
    </KitSection>

    <KitSection
      title="Status badge"
      code="<UiStatusBadge :status :label prominent>"
      description="Semantic entry. Default is dot + neutral text (the stackable, table-safe treatment). prominent escalates to a tinted chip — reserve for a single status. size='md' is the empty/error-state icon tile."
    >
      <div class="space-y-6">
        <KitRow label="default (dot)">
          <UiStatusBadge v-for="s in statuses" :key="s" :status="s" :label="s" />
        </KitRow>
        <KitRow label="prominent (chip)">
          <UiStatusBadge v-for="s in statuses" :key="s" :status="s" :label="s" :icon="statusIcon[s]" prominent />
        </KitRow>
        <KitRow label="md (container)">
          <UiStatusBadge v-for="s in statuses" :key="s" :status="s" :icon="statusIcon[s]" :label="s" size="md" />
        </KitRow>
      </div>
    </KitSection>

    <KitSection
      title="Dots & trend"
      code="<UiHealthDot> <UiSeverityDot> <UiSyncDot> <UiTrend>"
      description="The repeated-context default (color on the dot) plus signed change values."
    >
      <div class="space-y-6">
        <KitRow label="UiHealthDot">
          <UiHealthDot health="healthy" size="md" label="healthy" />
          <UiHealthDot health="attention" size="md" pulse label="attention" />
          <UiHealthDot health="issues" size="md" label="issues" />
          <UiHealthDot health="unknown" size="md" label="unknown" />
        </KitRow>
        <KitRow label="UiSeverityDot">
          <UiSeverityDot v-for="s in statuses" :key="s" :severity="s" :label="s" />
        </KitRow>
        <KitRow label="UiSyncDot">
          <UiSyncDot status="syncing" label="Syncing…" />
          <UiSyncDot status="pending" label="Pending" />
        </KitRow>
        <KitRow label="UiTrend">
          <UiTrend :value="128" />
          <UiTrend :value="-42" />
          <UiTrend :value="12.4" format="percent" />
          <UiTrend :value="0" is-new />
          <UiTrend :value="-100" format="percent" />
        </KitRow>
      </div>
    </KitSection>
  </div>
</template>
