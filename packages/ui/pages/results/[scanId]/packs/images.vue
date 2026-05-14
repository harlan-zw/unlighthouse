<script setup lang="ts">
// `images` pack view — D-028 wedge example. Renders the opinionated fix list
// the agent would consume via pack.run({pack: 'images'}).

import type { ImagesReport } from '@unlighthouse/core/packs'
import { usePackRun } from '~/composables/usePackRun'

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)
const { data: run, pending, error } = usePackRun(scanId, 'images')

// Narrow the generic pack output to ImagesReport.
const report = computed<ImagesReport | null>(() => (run.value?.report ?? null) as ImagesReport | null)

function formatBytes(n: number | null | undefined): string {
  if (n == null)
    return '—'
  if (n < 1024)
    return `${n} B`
  if (n < 1024 * 1024)
    return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function severityClasses(sev: string) {
  switch (sev) {
    case 'critical':
      return { dot: 'bg-error', text: 'text-error' }
    case 'serious':
      return { dot: 'bg-error/75', text: 'text-error' }
    case 'moderate':
      return { dot: 'bg-warning', text: 'text-warning' }
    default:
      return { dot: 'bg-muted', text: 'text-dimmed' }
  }
}

function kindLabel(kind: string) {
  switch (kind) {
    case 'unoptimized':
      return 'Compress / resize'
    case 'lcp-blocking':
      return 'LCP image'
    case 'unsized':
      return 'Missing dimensions'
    case 'missing-alt':
      return 'Missing alt text'
    default:
      return kind
  }
}

function imageHostname(url: string) {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
}

function shortPath(url: string) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    return parts.length ? `/${parts[parts.length - 1]}` : u.pathname
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
      <!-- Primary: total bytes savable hero + severity counts -->
      <section>
        <div class="flex items-baseline gap-8 flex-wrap mb-1">
          <div>
            <p class="text-xs text-dimmed uppercase tracking-widest mb-1">
              Total bytes savable
            </p>
            <div class="flex items-baseline gap-3">
              <span class="text-5xl font-semibold nums-tabular leading-none text-highlighted">
                {{ formatBytes(report.totalBytesSavable) }}
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
        <DashboardCard title="Image findings" :count="report.findings.length">
          <div v-if="!report.findings.length" class="text-sm text-muted px-1 py-6 text-center">
            No image issues detected. Every audited image passes optimisation, LCP, sizing and a11y checks.
          </div>
          <ul v-else class="divide-y divide-default">
            <li
              v-for="(f, i) in report.findings"
              :key="`${f.kind}-${f.imageUrl}-${i}`"
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
                  <span class="text-xs text-muted">{{ kindLabel(f.kind) }}</span>
                  <span v-if="f.routeCount > 1" class="text-xs text-dimmed">
                    · {{ f.routeCount }} routes
                  </span>
                </div>

                <p class="font-mono text-[13px] text-default truncate">
                  <span class="text-dimmed">{{ imageHostname(f.imageUrl) }}</span>{{ shortPath(f.imageUrl) }}
                </p>

                <p v-if="f.reason" class="text-sm text-muted mt-2 max-w-3xl">
                  {{ f.reason }}
                </p>

                <div v-if="f.routes.length > 1" class="mt-2 space-y-0.5">
                  <p class="text-[11px] text-dimmed uppercase tracking-widest">
                    Appears on
                  </p>
                  <ul class="space-y-0.5">
                    <li
                      v-for="r in f.routes"
                      :key="r"
                      class="font-mono text-[11px] text-dimmed truncate"
                    >
                      {{ r }}
                    </li>
                    <li v-if="f.routeCount > f.routes.length" class="text-[11px] text-dimmed">
                      … and {{ f.routeCount - f.routes.length }} more
                    </li>
                  </ul>
                </div>
              </div>

              <div class="shrink-0 text-right nums-tabular">
                <p v-if="f.wastedBytes != null" class="text-sm font-medium text-default">
                  {{ formatBytes(f.wastedBytes) }}
                </p>
                <p v-if="f.totalBytes != null" class="text-[11px] text-dimmed">
                  of {{ formatBytes(f.totalBytes) }}
                </p>
                <p v-if="f.lcpImpactMs != null && f.lcpImpactMs > 0" class="text-[11px] text-warning">
                  LCP −{{ f.lcpImpactMs }}ms
                </p>
              </div>
            </li>
          </ul>
        </DashboardCard>
      </section>
    </div>
  </div>
</template>
