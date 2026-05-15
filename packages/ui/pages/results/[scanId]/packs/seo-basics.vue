<script setup lang="ts">
// `seo-basics` pack view — sitewide indexability score, per-route SEO
// checklist, and a rule-grouped findings list. The headline number is
// `indexabilityPercent` (% of routes that pass the crawlability triad).

import type { SeoReport } from '@unlighthouse/core/packs'
import { usePackRun } from '~/composables/usePackRun'

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)
const { data: run, pending, error } = usePackRun(scanId, 'seo-basics')

const report = computed<SeoReport | null>(() => (run.value?.report ?? null) as SeoReport | null)

function severityClasses(sev: string) {
  switch (sev) {
    case 'critical': return { dot: 'bg-error', text: 'text-error', bg: 'bg-error/15' }
    case 'serious': return { dot: 'bg-error/75', text: 'text-error', bg: 'bg-error/10' }
    case 'moderate': return { dot: 'bg-warning', text: 'text-warning', bg: 'bg-warning/15' }
    default: return { dot: 'bg-muted', text: 'text-dimmed', bg: 'bg-muted' }
  }
}

function indexabilityClasses(pct: number) {
  if (pct >= 95)
    return 'text-success'
  if (pct >= 80)
    return 'text-warning'
  return 'text-error'
}

function shortPath(url: string) {
  try {
    const u = new URL(url)
    return u.pathname || '/'
  }
  catch {
    return url
  }
}
</script>

<template>
  <div>
    <PageError v-if="error" :title="error.message" />

    <div v-else-if="pending && !report" class="space-y-4">
      <USkeleton class="h-32 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <div v-else-if="report" class="space-y-10">
      <!-- Primary: indexability hero + severity counts -->
      <section>
        <div class="flex items-baseline gap-8 flex-wrap mb-1">
          <div>
            <p class="text-xs text-dimmed uppercase tracking-widest mb-1">
              Indexability
            </p>
            <div class="flex items-baseline gap-3">
              <span
                class="text-5xl font-semibold nums-tabular leading-none"
                :class="indexabilityClasses(report.indexabilityPercent)"
              >
                {{ report.indexabilityPercent }}%
              </span>
              <span class="text-sm text-muted">
                {{ report.indexableRoutes }}/{{ report.routesAnalysed }} routes pass crawlability
              </span>
            </div>
            <p class="text-[11px] text-dimmed mt-1">
              is-crawlable + http-status-code + robots-txt
            </p>
          </div>

          <div class="flex items-center gap-4 ml-auto nums-tabular">
            <div v-if="report.severityCounts.critical" class="flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-error" aria-hidden="true" />
              <span class="text-sm font-medium text-error">{{ report.severityCounts.critical }}</span>
              <span class="text-xs text-dimmed">critical</span>
            </div>
            <div v-if="report.severityCounts.serious" class="flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-error/75" aria-hidden="true" />
              <span class="text-sm font-medium text-error">{{ report.severityCounts.serious }}</span>
              <span class="text-xs text-dimmed">serious</span>
            </div>
            <div v-if="report.severityCounts.moderate" class="flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-warning" aria-hidden="true" />
              <span class="text-sm font-medium text-warning">{{ report.severityCounts.moderate }}</span>
              <span class="text-xs text-dimmed">moderate</span>
            </div>
            <div v-if="report.severityCounts.minor" class="flex items-center gap-1.5">
              <span class="size-2 rounded-full bg-muted" aria-hidden="true" />
              <span class="text-sm font-medium text-dimmed">{{ report.severityCounts.minor }}</span>
              <span class="text-xs text-dimmed">minor</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Secondary: rule violations -->
      <section>
        <DashboardCard title="Rule violations" :count="report.findings.length">
          <div v-if="!report.findings.length" class="text-sm text-muted px-1 py-6 text-center">
            All SEO audits pass across every route. Nothing to fix.
          </div>
          <ul v-else class="divide-y divide-default">
            <li
              v-for="f in report.findings"
              :key="f.auditId"
              class="py-4 px-1 flex items-start gap-3"
            >
              <span
                class="size-2 rounded-full shrink-0 mt-2"
                :class="severityClasses(f.severity).dot"
                aria-hidden="true"
              />

              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span class="text-xs uppercase tracking-widest" :class="severityClasses(f.severity).text">
                    {{ f.severity }}
                  </span>
                  <span class="text-xs text-dimmed">·</span>
                  <span class="font-mono text-xs text-muted">{{ f.auditId }}</span>
                </div>

                <p class="text-sm font-medium text-default">
                  {{ f.title }}
                </p>

                <p class="text-sm text-muted mt-2 max-w-3xl">
                  {{ f.fixHint }}
                </p>

                <div v-if="f.sampleElements.length" class="mt-3 space-y-1">
                  <p class="text-[11px] text-dimmed uppercase tracking-widest mb-1.5">
                    Sample elements
                  </p>
                  <ul class="space-y-1">
                    <li
                      v-for="(e, i) in f.sampleElements"
                      :key="i"
                      class="font-mono text-[12px] text-default bg-elevated/40 rounded-md px-2 py-1 truncate"
                    >
                      {{ e.selector || e.snippet || e.nodeLabel || '(no selector)' }}
                    </li>
                  </ul>
                </div>

                <div v-if="f.routes.length" class="mt-3 space-y-0.5">
                  <p class="text-[11px] text-dimmed uppercase tracking-widest mb-1">
                    On {{ f.routeCount }} route{{ f.routeCount === 1 ? '' : 's' }}
                  </p>
                  <ul class="space-y-0.5">
                    <li
                      v-for="r in f.routes"
                      :key="r"
                      class="font-mono text-[11px] text-dimmed truncate"
                    >
                      {{ shortPath(r) }}
                    </li>
                    <li v-if="f.routeCount > f.routes.length" class="text-[11px] text-dimmed">
                      … and {{ f.routeCount - f.routes.length }} more
                    </li>
                  </ul>
                </div>
              </div>

              <div class="shrink-0 text-right nums-tabular">
                <p class="text-sm font-medium text-default">
                  {{ f.routeCount }}
                </p>
                <p class="text-[11px] text-dimmed">
                  {{ f.routeCount === 1 ? 'route' : 'routes' }}
                </p>
              </div>
            </li>
          </ul>
        </DashboardCard>
      </section>

      <!-- Tertiary: per-route check (compact table) -->
      <section v-if="report.routeChecks.length">
        <DashboardCard title="Per-route check" :count="report.routeChecks.length">
          <ul class="divide-y divide-default">
            <li
              v-for="rc in report.routeChecks"
              :key="rc.url"
              class="flex items-center gap-3 py-2 px-1"
            >
              <span
                class="size-1.5 rounded-full shrink-0"
                :class="rc.indexable ? 'bg-success' : 'bg-error'"
                aria-hidden="true"
              />
              <p class="font-mono text-[12px] text-default truncate flex-1">
                {{ shortPath(rc.url) }}
              </p>
              <span
                v-if="!rc.indexable"
                class="text-[10px] uppercase tracking-widest text-error font-medium"
              >
                no-index
              </span>
              <span class="text-[11px] text-success nums-tabular shrink-0">
                {{ rc.passes }} pass
              </span>
              <span
                v-if="rc.fails"
                class="text-[11px] text-error nums-tabular shrink-0"
              >
                {{ rc.fails }} fail
              </span>
            </li>
          </ul>
        </DashboardCard>
      </section>
    </div>
  </div>
</template>
