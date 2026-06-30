<script setup lang="ts">
import type { SeoReport } from '@unlighthouse/contracts/packs'
import CategoryPageShell from '~/features/scan/components/CategoryPageShell.vue'
import PackFindings from '~/features/scan/components/PackFindings.vue'
import { getScanId } from '~/features/scan/route-context'

definePageMeta({ layout: 'scan' })

const scanId = getScanId()

const { data: seoPack, status, error: seoError, refresh: refreshSeo } = useApiQuery('pack.run', () => ({ scanId, pack: 'seo-basics' }))

const report = computed(() => (seoPack.value?.report ?? null) as SeoReport | null)
</script>

<template>
  <CategoryPageShell
    title="SEO"
    pack="seo-basics"
    :status="status"
    :error="seoError"
    :on-retry="refreshSeo"
    :report="report"
    empty-message="No SEO data available. Run a scan first."
    loading-message="Loading SEO data..."
  >
    <template v-if="report">
      <!-- Indexability summary cards — SEO-specific. -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <UiStat card title="Indexability" :value="report.indexabilityPercent" suffix="%" :value-class="report.indexabilityPercent === 100 ? 'text-success' : report.indexabilityPercent >= 80 ? 'text-warning' : 'text-error'" />
        <UiStat card title="Indexable Routes" :value="report.indexableRoutes" value-class="text-success" />
        <UiStat card title="Unindexable Routes" :value="report.unindexableRoutes" :value-class="report.unindexableRoutes > 0 ? 'text-error' : 'text-success'" />
        <UiStat card title="Routes Analysed" :value="report.routesAnalysed" />
      </div>

      <!-- Findings via the shared accordion. -->
      <PackFindings :findings="report.findings" title="SEO Issues" />

      <!-- Per-route checks table (SEO-specific again). -->
      <UiCard v-if="report.routeChecks.length" size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">
            Route Checks
          </h3>
        </template>
        <table class="w-full">
          <thead>
            <tr class="h-9 border-b border-default">
              <th class="text-label text-dimmed text-left px-3">
                URL
              </th>
              <th class="text-label text-dimmed text-right px-3 w-20">
                Passes
              </th>
              <th class="text-label text-dimmed text-right px-3 w-20">
                Fails
              </th>
              <th class="text-label text-dimmed text-left px-3 w-20">
                Indexable
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rc in report.routeChecks" :key="rc.url" class="border-b border-default last:border-0">
              <td class="font-mono text-xs truncate max-w-sm px-3 py-2" :title="rc.url">
                {{ rc.url }}
              </td>
              <td class="text-right tabular-nums text-success px-3 py-2">
                {{ rc.passes }}
              </td>
              <td class="text-right tabular-nums px-3 py-2" :class="rc.fails > 0 ? 'text-error' : ''">
                {{ rc.fails }}
              </td>
              <td class="px-3 py-2">
                <UiIcon :name="rc.indexable ? 'success' : 'error'" :class="rc.indexable ? 'text-success' : 'text-error'" class="size-4" />
              </td>
            </tr>
          </tbody>
        </table>
      </UiCard>

      <div v-if="!report.findings.length && !report.routeChecks.length" class="text-center py-12 text-muted">
        No SEO issues found.
      </div>
    </template>
  </CategoryPageShell>
</template>
