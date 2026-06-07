<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

definePageMeta({ layout: 'scan' })

const api = useApi()
const scanId = getScanId()
const { scoreToColor, scoreToLabel } = useScoreColor()
const { fmtBytes } = useFormat()

const { data: bundlePack, status } = useAsyncData(
  `bp-bundle-${scanId}`,
  () => api['pack.run']({ scanId, pack: 'js-bundle' }).catch(() => null),
)

const { data: routeScores } = useAsyncData(
  `bp-routes-${scanId}`,
  () => api['scan.results']({ scanId, page: 1, pageSize: 200, sort: 'score-asc' }).catch(() => null),
)

// There is no dedicated "best-practices" pack, so the actual failing
// audits (image-aspect-ratio, errors-in-console, inspector-issues, the
// CSP/HSTS security checks, …) never surfaced — the page only showed JS
// bundle ergonomics + a bare score table. Aggregate the real audits the
// same way the SEO/a11y packs do: fan out `route.audits` per route, keep
// the failing ones, and group by audit id into PackFindings-shaped
// findings.
const { data: bpFindings } = useAsyncData(
  `bp-audits-${scanId}`,
  async () => {
    const list = routeScores.value?.items ?? []
    if (!list.length)
      return []
    const perRoute = await Promise.all(
      list.map(r =>
        api['route.audits']({ scanId, url: r.url, category: 'best-practices' })
          .then(res => ({ path: r.path, audits: (res as any)?.audits ?? [] }))
          .catch(() => ({ path: r.path, audits: [] as any[] })),
      ),
    )

    // weight → severity, mirroring seo-basics' severityFromWeight.
    const severityFromWeight = (w: number) =>
      w >= 3 ? 'critical' : w >= 1 ? 'serious' : w > 0 ? 'moderate' : 'minor'

    const byAudit = new Map<string, any>()
    for (const { path, audits } of perRoute) {
      for (const a of audits) {
        // Only actionable audits: a real failure (score < 1). Skip
        // informative / not-applicable audits (score === null).
        if (a.score === null || a.score >= 1)
          continue
        let f = byAudit.get(a.id)
        if (!f) {
          f = {
            auditId: a.id,
            title: a.title,
            description: a.description,
            severity: severityFromWeight(a.weight ?? 0),
            routes: [] as string[],
          }
          byAudit.set(a.id, f)
        }
        f.routes.push(path)
      }
    }

    const rank: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3, info: 4 }
    return Array.from(byAudit.values())
      .map(f => ({ ...f, routeCount: f.routes.length }))
      .sort((a, b) =>
        (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9)
        || b.routeCount - a.routeCount,
      )
  },
  { watch: [routeScores] },
)

const bundleReport = computed(() => (bundlePack.value as any)?.report ?? null)
const findings = computed(() => bpFindings.value ?? [])

// js-bundle findings are keyed by `kind` + `resource` — NOT the
// title/auditId shape the template originally assumed, which is exactly
// why the rows rendered blank (only the "N routes" badge showed). Map
// the kind to a readable label and trim the resource URL.
const BUNDLE_KIND_LABELS: Record<string, string> = {
  'unused-js': 'Unused JavaScript',
  'unused-css': 'Unused CSS',
  'third-party': 'Third-party script',
  'render-blocking': 'Render-blocking resource',
  'legacy-js': 'Legacy JavaScript',
  'duplicated-js': 'Duplicated JavaScript',
}
function bundleKindLabel(kind: string): string {
  return BUNDLE_KIND_LABELS[kind] ?? kind
}
function shortResource(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`
  }
  catch {
    return url
  }
}
// Best Practices draws from three sources (the failing audits, the
// js-bundle pack, and raw route scores). The page is "ready" when any
// has content; pass the combined signal to the shell so the empty state
// only shows when none produced data.
const hasData = computed(() =>
  findings.value.length > 0
  || !!bundleReport.value
  || (routeScores.value?.items?.length ?? 0) > 0,
)
</script>

<template>
  <CategoryPageShell
    title="Best Practices"
    pack="js-bundle"
    :status="status"
    :report="hasData ? true : null"
    empty-message="No best practices data available. Run a scan first."
    loading-message="Loading best practices data..."
  >
    <!-- Failing best-practices audits, grouped by audit id. This is the
         data that was previously missing entirely. -->
    <PackFindings :findings="findings" title="Best Practices Issues" />

    <!-- JS Bundle Analysis -->
    <Card v-if="bundleReport?.findings?.length">
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
          JS Bundle Issues
          <Badge variant="secondary" class="text-xs">
            {{ bundleReport.findings.length }}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          <div v-for="(finding, idx) in bundleReport.findings" :key="`${finding.kind}-${finding.resource}-${idx}`" class="p-3 border rounded-lg">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="text-sm font-medium flex items-center gap-2">
                  <Badge variant="outline" class="text-[10px] capitalize shrink-0">
                    {{ finding.severity }}
                  </Badge>
                  {{ bundleKindLabel(finding.kind) }}
                </div>
                <div v-if="finding.resource" class="text-xs text-muted-foreground font-mono truncate mt-1" :title="finding.resource">
                  {{ shortResource(finding.resource) }}
                </div>
              </div>
              <Badge variant="outline" class="text-xs shrink-0">
                {{ finding.routeCount }} route{{ finding.routeCount === 1 ? '' : 's' }}
              </Badge>
            </div>
            <div v-if="finding.wastedBytes" class="text-xs text-warning mt-2">
              {{ fmtBytes(finding.wastedBytes) }} wasted<span v-if="finding.wastedPercent"> ({{ finding.wastedPercent }}%)</span>
            </div>
            <div v-if="finding.fixHint" class="text-xs text-muted-foreground mt-1">
              {{ finding.fixHint }}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Route Scores -->
    <Card v-if="routeScores?.items?.length">
      <CardHeader class="pb-3">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          Route Scores
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Path</TableHead>
              <TableHead class="w-28 text-right">
                Best Practices
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="r in routeScores.items.slice(0, 50)" :key="r.url">
              <TableCell class="font-mono text-xs truncate max-w-sm" :title="r.url">
                {{ r.path }}
              </TableCell>
              <TableCell class="text-right tabular-nums font-bold" :class="scoreToColor(r.scoreBestPractices)">
                {{ scoreToLabel(r.scoreBestPractices) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </CategoryPageShell>
</template>
