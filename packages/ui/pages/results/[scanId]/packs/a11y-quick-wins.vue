<script setup lang="ts">
// `a11y-quick-wins` pack view — sitewide accessibility violations grouped
// by rule, with copy-paste fix hints and affected-element samples.

import type { A11yReport } from '@unlighthouse/core/packs'
import { usePackRun } from '~/composables/usePackRun'

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)
const { data: run, pending, error } = usePackRun(scanId, 'a11y-quick-wins')

const report = computed<A11yReport | null>(() => (run.value?.report ?? null) as A11yReport | null)

function severityClasses(sev: string) {
  switch (sev) {
    case 'critical':
      return { dot: 'bg-error', text: 'text-error', bg: 'bg-error/15' }
    case 'serious':
      return { dot: 'bg-error/75', text: 'text-error', bg: 'bg-error/10' }
    case 'moderate':
      return { dot: 'bg-warning', text: 'text-warning', bg: 'bg-warning/15' }
    default:
      return { dot: 'bg-muted', text: 'text-dimmed', bg: 'bg-muted' }
  }
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
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <div v-else-if="report" class="space-y-10">
      <!-- Primary: total violations hero + severity counts -->
      <section>
        <div class="flex items-baseline gap-8 flex-wrap mb-1">
          <div>
            <p class="text-xs text-dimmed uppercase tracking-widest mb-1">
              Accessibility violations
            </p>
            <div class="flex items-baseline gap-3">
              <span class="text-5xl font-semibold nums-tabular leading-none text-highlighted">
                {{ report.totalViolations }}
              </span>
              <span class="text-sm text-muted">
                across {{ report.routesAnalysed }} route{{ report.routesAnalysed === 1 ? '' : 's' }}
              </span>
            </div>
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

      <!-- Secondary: findings list -->
      <section>
        <DashboardCard title="Rule violations" :count="report.findings.length">
          <div v-if="!report.findings.length" class="text-sm text-muted px-1 py-6 text-center">
            No accessibility violations detected across this scan.
          </div>
          <ul v-else class="divide-y divide-default">
            <li
              v-for="f in report.findings"
              :key="f.auditId"
              class="py-5 px-1 flex items-start gap-3"
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

                <p v-if="f.fixHint" class="text-sm text-muted mt-2 max-w-3xl">
                  {{ f.fixHint }}
                </p>

                <!-- Top affected elements -->
                <div v-if="f.topElements.length" class="mt-3 space-y-1">
                  <p class="text-[11px] text-dimmed uppercase tracking-widest mb-1.5">
                    Affected elements ({{ f.elementCount }})
                  </p>
                  <ul class="space-y-1">
                    <li
                      v-for="e in f.topElements"
                      :key="e.selector"
                      class="font-mono text-[12px] text-default bg-elevated/40 rounded-md px-2 py-1 truncate"
                    >
                      {{ e.selector }}
                    </li>
                    <li v-if="f.elementCount > f.topElements.length" class="text-[11px] text-dimmed pl-1">
                      … and {{ f.elementCount - f.topElements.length }} more
                    </li>
                  </ul>
                </div>

                <!-- Affected routes -->
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
                  {{ f.elementCount }}
                </p>
                <p class="text-[11px] text-dimmed">
                  {{ f.elementCount === 1 ? 'element' : 'elements' }}
                </p>
                <p v-if="f.weight > 0" class="text-[10px] text-dimmed mt-1">
                  weight {{ f.weight }}
                </p>
              </div>
            </li>
          </ul>
        </DashboardCard>
      </section>
    </div>
  </div>
</template>
