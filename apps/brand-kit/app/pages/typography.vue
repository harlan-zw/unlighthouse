<script setup lang="ts">
const topQueries = [
  { q: 'nuxt seo', clicks: '1,204', pos: '2.4' },
  { q: 'nuxt sitemap', clicks: '842', pos: '3.1' },
  { q: 'nuxt og image', clicks: '617', pos: '1.9' },
  { q: 'nuxt robots txt', clicks: '430', pos: '4.2' },
]
const stats = [
  { label: 'Clicks', value: '48,210', delta: '+12.4%', tone: 'text-success' },
  { label: 'Impressions', value: '1.2M', delta: '+3.1%', tone: 'text-success' },
  { label: 'Avg position', value: '8.7', delta: '-0.4', tone: 'text-error' },
]
const activity = [
  { icon: 'i-lucide-trending-up', title: 'nuxt seo', detail: 'climbed to position 2.4', time: '2 hours ago', value: '+18' },
  { icon: 'i-lucide-file-plus', title: '12 pages', detail: 'newly indexed', time: 'Yesterday', value: '+12' },
  { icon: 'i-lucide-link', title: 'New backlink', detail: 'from vuejs.org', time: '2 days ago', value: 'DR 91' },
]
</script>

<template>
  <div class="space-y-12">
    <KitHeader
      eyebrow="Foundation"
      title="Typography"
      description="One variable font (Hubot Sans) driven by axis vars. Semantic role tokens bundle size, weight, width, tracking and leading; sizes resize per context (editorial vs .dashboard-theme)."
    />

    <!-- ─── Reference: the size scale ─── -->
    <KitSection title="Size scale" description="Tailwind primitives at ≥12px; custom tokens own the dense sub-12 micro range.">
      <div class="space-y-2">
        <div
          v-for="row in [
            { cls: 'text-lg', note: '18px · text-lg' },
            { cls: 'text-base', note: '16px · text-base' },
            { cls: 'text-sm', note: '14px · text-sm · default body' },
            { cls: 'text-xs', note: '12px · text-xs · dense body' },
            { cls: 'text-mini', note: '10px · .text-mini · metadata' },
          ]" :key="row.cls" class="flex items-baseline gap-4"
        >
          <span :class="row.cls" class="text-highlighted w-48 shrink-0">The quick brown fox</span>
          <span class="text-mini text-dimmed font-mono">{{ row.note }}</span>
        </div>
      </div>
    </KitSection>

    <!-- ─── Reference: role tokens (editorial sizing) ─── -->
    <KitSection title="Role tokens" description="Each bundles every Hubot axis for its role. Shown at editorial size; compact inside .dashboard-theme.">
      <div class="space-y-4">
        <div class="flex items-baseline gap-4">
          <p class="text-title text-highlighted w-64 shrink-0">
            Page title
          </p>
          <span class="text-mini text-dimmed font-mono">.text-title · wght 680 · wdth 92% · tight</span>
        </div>
        <div class="flex items-baseline gap-4">
          <p class="text-heading text-highlighted w-64 shrink-0">
            Section heading
          </p>
          <span class="text-mini text-dimmed font-mono">.text-heading · wght 620 · snug</span>
        </div>
        <div class="flex items-baseline gap-4">
          <p class="text-subheading text-highlighted w-64 shrink-0">
            Subheading
          </p>
          <span class="text-mini text-dimmed font-mono">.text-subheading · wght 540</span>
        </div>
        <div class="flex items-baseline gap-4">
          <p class="text-sm text-default w-64 shrink-0">
            Regular, <span class="font-emphasis">emphasis</span>, <span class="font-strong">strong</span>
          </p>
          <span class="text-mini text-dimmed font-mono">.font-emphasis 540 · .font-strong 620</span>
        </div>
        <div class="flex items-baseline gap-4">
          <p class="eyebrow w-64 shrink-0">
            Eyebrow label
          </p>
          <span class="text-mini text-dimmed font-mono">.eyebrow · uppercase · 0.08em</span>
        </div>
      </div>
    </KitSection>

    <!-- ─── In context: dashboard (compact) ─── -->
    <KitSection title="In context: dashboard" description="Wrapped in .dashboard-theme: role tokens resolve to their compact sizes, neutrals shift to mauve.">
      <div class="dashboard-theme rounded-xl border border-default bg-default p-6 space-y-6">
        <!-- page header + tabs -->
        <div class="space-y-3">
          <div>
            <h1 class="text-title text-highlighted">
              Search performance
            </h1>
            <p class="text-description mt-1">
              Clicks, impressions and average position across every tracked query.
            </p>
          </div>
          <div class="flex gap-5 border-b border-default">
            <span class="text-label text-default pb-2 -mb-px border-b-2 border-[var(--ui-text)]">Overview</span>
            <span class="text-label text-dimmed pb-2">Queries</span>
            <span class="text-label text-dimmed pb-2">Pages</span>
            <span class="text-label text-dimmed pb-2">Countries</span>
          </div>
        </div>

        <!-- stat tiles: label on its own line, then value + delta on a shared baseline -->
        <div class="grid grid-cols-3 gap-3">
          <div v-for="s in stats" :key="s.label" class="rounded-lg border border-default bg-muted/40 p-3 space-y-1.5">
            <span class="text-label text-dimmed block truncate">{{ s.label }}</span>
            <div class="flex items-baseline justify-between gap-2">
              <span class="numerals-display text-2xl text-highlighted leading-none">{{ s.value }}</span>
              <span class="text-mini tabular-nums shrink-0" :class="s.tone">{{ s.delta }}</span>
            </div>
          </div>
        </div>

        <!-- data card -->
        <div class="rounded-lg border border-default bg-muted/40 p-4 space-y-3 max-w-md">
          <div class="flex items-center justify-between">
            <h3 class="text-subheading text-highlighted">
              Top queries
            </h3>
            <span class="text-mini text-dimmed">Last 28 days</span>
          </div>
          <div class="space-y-2">
            <div class="grid grid-cols-[1fr_auto_auto] gap-4 text-label text-dimmed">
              <span>Query</span><span class="text-right">Clicks</span><span class="text-right w-10">Pos</span>
            </div>
            <div v-for="r in topQueries" :key="r.q" class="grid grid-cols-[1fr_auto_auto] gap-4 items-baseline">
              <span class="text-xs text-default truncate">{{ r.q }}</span>
              <span class="text-xs numerals-display text-highlighted text-right">{{ r.clicks }}</span>
              <span class="text-xs numerals-display text-muted text-right w-10">{{ r.pos }}</span>
            </div>
          </div>
        </div>
      </div>
    </KitSection>

    <!-- ─── In context: editorial ─── -->
    <KitSection title="In context: editorial" description="Default (non-dashboard) context: role tokens render at their full editorial sizes.">
      <div class="rounded-xl border border-default bg-default p-8 space-y-4 max-w-2xl">
        <p class="eyebrow text-primary">
          Search Console
        </p>
        <h1 class="text-title text-highlighted">
          Understand what people search before they reach you
        </h1>
        <p class="text-base text-muted leading-relaxed">
          Connect Google Search Console and Nuxt SEO surfaces the queries, pages and
          countries driving your traffic, with the regressions and quick wins called out.
        </p>
        <div class="flex items-center gap-2 pt-1">
          <span class="text-sm font-strong text-highlighted">Free forever.</span>
          <span class="text-sm text-muted">No credit card.</span>
        </div>
      </div>
    </KitSection>

    <!-- ─── In context: more patterns (dashboard) ─── -->
    <KitSection title="In context: form field" description="Field label (.text-label), input (text-sm), help text (text-xs muted).">
      <div class="dashboard-theme max-w-sm space-y-1.5">
        <label class="text-label text-dimmed block">Site URL</label>
        <input
          type="text"
          value="https://nuxtseo.com"
          class="w-full rounded-md border border-default bg-muted/40 px-2.5 py-1.5 text-sm text-default outline-none focus:border-accented"
        >
        <p class="text-xs text-muted">
          The canonical origin used for sitemap and OG tags.
        </p>
      </div>
    </KitSection>

    <KitSection title="In context: empty state" description="Subheading title + muted body + .text-label action, the centered no-data pattern.">
      <div class="dashboard-theme rounded-lg border border-default bg-muted/40 p-8 text-center max-w-md mx-auto space-y-2">
        <UIcon name="i-lucide-search-x" class="size-6 text-dimmed mx-auto" />
        <h3 class="text-subheading text-highlighted">
          No queries yet
        </h3>
        <p class="text-xs text-muted max-w-xs mx-auto leading-relaxed">
          Connect Google Search Console to see the searches driving traffic to your site.
        </p>
        <button type="button" class="text-label text-primary pt-1">
          Connect now
        </button>
      </div>
    </KitSection>

    <KitSection title="In context: activity feed" description="Emphasis title + text-xs body + .text-mini timestamp + numerals, dense list rhythm.">
      <div class="dashboard-theme rounded-lg border border-default bg-muted/40 divide-y divide-[var(--ui-border)] max-w-md">
        <div v-for="a in activity" :key="a.title" class="flex items-start gap-3 p-3">
          <div class="size-6 rounded-md bg-elevated flex items-center justify-center shrink-0">
            <UIcon :name="a.icon" class="size-3.5 text-dimmed" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs text-default">
              <span class="font-emphasis text-highlighted">{{ a.title }}</span> {{ a.detail }}
            </p>
            <p class="text-mini text-dimmed mt-0.5">
              {{ a.time }}
            </p>
          </div>
          <span class="numerals-display text-xs text-muted shrink-0">{{ a.value }}</span>
        </div>
      </div>
    </KitSection>

    <KitSection title="Mono">
      <code class="text-sm font-mono text-muted">--font-mono: 'Fira Code', monospace;</code>
    </KitSection>
  </div>
</template>
