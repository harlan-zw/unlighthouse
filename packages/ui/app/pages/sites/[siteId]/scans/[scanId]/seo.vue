<script setup lang="ts">
definePageMeta({ layout: 'scan' })

const api = useApi()
const scanId = getScanId()

const { data: seoPack, status } = useAsyncData(
  `seo-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'seo-basics' }).catch(() => null),
)

const report = computed(() => (seoPack.value as any)?.report ?? null)
</script>

<template>
  <CategoryPageShell
    title="SEO"
    pack="seo-basics"
    :status="status"
    :report="report"
    empty-message="No SEO data available. Run a scan first."
    loading-message="Loading SEO data..."
  >
    <!-- Indexability summary cards — SEO-specific. -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard>
        <div class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold tabular-nums" :class="report.indexabilityPercent === 100 ? 'text-green-500' : report.indexabilityPercent >= 80 ? 'text-orange-500' : 'text-red-500'">
            {{ report.indexabilityPercent ?? 0 }}%
          </div>
          <div class="text-xs text-muted">
            Indexability
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold text-green-500 tabular-nums">
            {{ report.indexableRoutes ?? 0 }}
          </div>
          <div class="text-xs text-muted">
            Indexable Routes
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold tabular-nums" :class="report.unindexableRoutes > 0 ? 'text-red-500' : 'text-green-500'">
            {{ report.unindexableRoutes ?? 0 }}
          </div>
          <div class="text-xs text-muted">
            Unindexable Routes
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="pt-5 pb-4 text-center">
          <div class="text-2xl font-bold tabular-nums">
            {{ report.routesAnalysed ?? 0 }}
          </div>
          <div class="text-xs text-muted">
            Routes Analysed
          </div>
        </div>
      </UCard>
    </div>

    <!-- Findings via the shared accordion. -->
    <PackFindings :findings="report.findings ?? []" title="SEO Issues" />

    <!-- Per-route checks table (SEO-specific again). -->
    <UCard v-if="report.routeChecks?.length">
      <template #header>
        <h3 class="text-sm font-medium text-muted">
          Route Checks
        </h3>
      </template>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-default">
            <th class="text-left font-medium text-muted py-2">URL</th>
            <th class="w-20 text-right font-medium text-muted py-2">
              Passes
            </th>
            <th class="w-20 text-right font-medium text-muted py-2">
              Fails
            </th>
            <th class="w-20 text-left font-medium text-muted py-2">
              Indexable
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rc in report.routeChecks" :key="rc.url" class="border-b border-default">
            <td class="font-mono text-xs truncate max-w-sm py-2" :title="rc.url">
              {{ rc.url }}
            </td>
            <td class="text-right tabular-nums text-green-500 py-2">
              {{ rc.passes }}
            </td>
            <td class="text-right tabular-nums py-2" :class="rc.fails > 0 ? 'text-red-500' : ''">
              {{ rc.fails }}
            </td>
            <td class="py-2">
              <Icon
                :name="rc.indexable ? 'lucide:check-circle' : 'lucide:x-circle'"
                :class="rc.indexable ? 'text-green-500' : 'text-red-500'"
                class="size-4"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <div v-if="!report.findings?.length && !report.routeChecks?.length" class="text-center py-12 text-muted">
      No SEO issues found.
    </div>
  </CategoryPageShell>
</template>
