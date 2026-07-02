<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { SiteHomeRow } from '~/features/sites/home'
import { h } from 'vue'
import { useSitesHome } from '~/features/sites/home'
import { useSitesRegistry } from '~/features/sites/registry'

definePageMeta({ middleware: 'onboarding' })
usePageTitle('Sites')

const { scoreToColor, scoreToLabel } = createScoreColorHelpers()
const { fmtRelTime } = createFormatters()

const FaviconC = resolveComponent('UiFavicon')
const SparklineC = resolveComponent('UiSparkline')
const ChipC = resolveComponent('UiChip')
const TooltipC = resolveComponent('UiTooltip')

const {
  historyStatus,
  historyError,
  sitesError,
  refreshHistory,
  refreshSites,
  rows,
  isEmpty,
  activeScan,
  openActiveScan,
  openSite,
} = useSitesHome()

const {
  editing,
  formOpen,
  formUrl,
  formName,
  formGroup,
  saving,
  groupSuggestions,
  openAdd,
  openEdit,
  openRegister,
  saveSite,
  deleteSite,
  scanSite,
} = useSitesRegistry()

const loadError = computed(() => historyError.value || sitesError.value)
function retryLoad() {
  refreshHistory()
  refreshSites()
}

const { scoreToRingColor } = createScoreColorHelpers()
function score100Color(v: number | null): string {
  return scoreToRingColor(v == null ? null : v / 100)
}

function statusWord(score: number | null): string {
  switch (scoreBand(score)) {
    case 'good': return 'passing'
    case 'average': return 'needs work'
    case 'poor': return 'poor'
    default: return 'no data'
  }
}

// ── Sites table ──────────────────────────────────────────────────────────────
const CAT_COLS: { key: string, label: string }[] = [
  { key: 'performance', label: 'Perf' },
  { key: 'accessibility', label: 'A11y' },
  { key: 'seo', label: 'SEO' },
  { key: 'best-practices', label: 'BP' },
  { key: 'agentic-browsing', label: 'Agentic' },
]

const columns: ColumnDef<SiteHomeRow>[] = [
  {
    accessorKey: 'name',
    header: 'Site',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2.5 min-w-0' }, [
      h(FaviconC, { domain: row.original.slug, size: 24, alt: `${row.original.name} favicon` }),
      h('div', { class: 'min-w-0' }, [
        h('div', { class: 'flex items-center gap-1.5 min-w-0' }, [
          h('span', { class: 'text-sm font-medium truncate' }, row.original.name),
          !row.original.registered && h(TooltipC, {
            title: 'Unregistered',
            description: 'Scan history exists for this origin, but it isn\'t in the registry.',
          }, {
            default: () => h(ChipC, { purpose: 'tag', size: 'xs' }, { default: () => 'Unregistered' }),
          }),
        ]),
        h('div', { class: 'text-[11px] text-muted font-mono truncate' }, row.original.url),
      ]),
    ]),
  },
  {
    id: 'group',
    accessorFn: (r: SiteHomeRow) => r.group ?? '',
    header: 'Group',
    align: 'left',
    cell: ({ row }) => {
      const group = row.original.group
      return group
        ? h(ChipC, { purpose: 'count' }, { default: () => group })
        : h('span', { class: 'text-xs text-dimmed' }, '—')
    },
  },
  {
    id: 'avg',
    accessorFn: (r: SiteHomeRow) => r.avg ?? undefined,
    header: 'Score',
    sortUndefined: 'last',
    align: 'center',
    cell: ({ row }) => h('span', { class: 'inline-flex items-baseline gap-1.5' }, [
      h('span', { class: `text-sm font-bold tabular-nums ${scoreToColor(row.original.avg)}` }, scoreToLabel(row.original.avg)),
      h('span', { class: 'text-xs text-muted' }, statusWord(row.original.avg)),
    ]),
  },
  ...CAT_COLS.map((c): ColumnDef<SiteHomeRow> => ({
    id: c.key,
    accessorFn: (r: SiteHomeRow) => r.cats[c.key] ?? undefined,
    header: c.label,
    sortUndefined: 'last' as const,
    align: 'center' as const,
    cell: ({ row }) => {
      const v = row.original.cats[c.key] as number | undefined
      return h('span', { class: `text-xs font-semibold tabular-nums ${scoreToColor(v ?? null)}` }, scoreToLabel(v ?? null))
    },
  })),
  {
    id: 'trend',
    header: 'Trend',
    enableSorting: false,
    align: 'left',
    cell: ({ row }) => h(SparklineC, { data: row.original.series, color: score100Color(row.original.avg != null ? row.original.avg * 100 : null), width: '100%', height: 28, preserveAspectRatio: 'none' }),
  },
  {
    id: 'last',
    accessorFn: (r: SiteHomeRow) => r.lastAt ?? '',
    header: 'Last scan',
    align: 'right',
    cell: ({ row }) => h('span', { class: 'text-xs text-muted tabular-nums' }, row.original.lastAt ? fmtRelTime(row.original.lastAt) : '—'),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader title="Sites" description="Every site you scan, registered or not." flush>
      <template #actions>
        <UModal v-model:open="formOpen" :title="editing ? 'Edit Site' : 'Add Site'" :ui="{ content: 'sm:max-w-md' }">
          <UiButton purpose="secondary" icon="add" label="Add site" @click="openAdd" />
          <template #body>
            <form id="site-form" class="space-y-4" @submit.prevent="saveSite">
              <UFormField label="URL">
                <UInput v-model="formUrl" placeholder="https://example.com" aria-label="Site URL" required class="w-full font-mono" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
              </UFormField>
              <p v-if="editing && formUrl !== editing.url" class="text-[11px] text-warning">
                Changing the URL creates a new site. The old one will remain.
              </p>
              <UFormField label="Display name" hint="optional">
                <UInput v-model="formName" :placeholder="editing?.name || 'example.com'" aria-label="Display name" class="w-full" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
              </UFormField>
              <UFormField label="Group" hint="optional">
                <UInput v-model="formGroup" list="site-group-suggestions" placeholder="e.g. Production, Staging" aria-label="Group" class="w-full" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
                <datalist id="site-group-suggestions">
                  <option v-for="g in groupSuggestions" :key="g" :value="g" />
                </datalist>
              </UFormField>
            </form>
          </template>
          <template #footer>
            <UiButton purpose="cta" type="submit" form="site-form" :loading="saving" :disabled="saving || !formUrl.trim()">
              {{ editing ? 'Save' : 'Add' }}
            </UiButton>
          </template>
        </UModal>
        <UiButton purpose="cta" to="/scan/new" icon="add">
          New scan
        </UiButton>
      </template>
    </UiPageHeader>

    <!-- Active scan banner -->
    <div v-if="activeScan.isActive" class="rounded-lg border border-primary/50 bg-primary/5 cursor-pointer p-4" @click="openActiveScan">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="relative flex size-2">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span class="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span class="text-sm font-medium">Scanning {{ activeScan.site }}</span>
        </div>
        <span class="text-sm tabular-nums text-muted">{{ activeScan.scanned }}/{{ activeScan.total }}</span>
      </div>
      <UProgress :model-value="activeScan.percent" size="sm" />
    </div>

    <!-- Failed to load sites or scans. Shown instead of the empty state so an
         unreachable backend doesn't read as "nothing registered yet". -->
    <QueryError v-if="loadError" :error="loadError" :on-retry="retryLoad" />

    <!-- Empty state -->
    <UiEmptyState
      v-else-if="isEmpty"
      icon="radar"
      title="Connect a site to run your first audit"
      description="Add a site to the registry, or run a scan. Either one starts this list."
    >
      <div class="flex items-center gap-2">
        <UiButton purpose="secondary" icon="add" @click="openAdd">
          Add site
        </UiButton>
        <UiButton purpose="cta" to="/scan/new" icon="radar">
          New scan
        </UiButton>
      </div>
    </UiEmptyState>

    <UiTable v-else :columns="columns" :data="rows" :loading="historyStatus === 'pending'" enable-sorting row-clickable row-hover row-id="key" @row-click="openSite">
      <template #actions="{ row }">
        <div class="flex items-center justify-end gap-1">
          <template v-if="row.registered">
            <UiButton purpose="quiet" size="xs" icon="radar" aria-label="Run new scan" @click.stop="scanSite(row.url)" />
            <UiButton purpose="quiet" size="xs" icon="edit" aria-label="Edit site" @click.stop="openEdit(row.site!)" />
            <UModal
              title="Remove site?"
              :description="`This removes ${row.name} from the registry. Scan history will be preserved.`"
            >
              <UiButton purpose="quiet" size="xs" icon="delete" aria-label="Delete site" @click.stop />
              <template #footer="{ close }">
                <UiButton purpose="quiet" @click="close">
                  Cancel
                </UiButton>
                <UiButton purpose="danger" @click="() => { deleteSite(row.site!.id); close() }">
                  Remove
                </UiButton>
              </template>
            </UModal>
          </template>
          <template v-else>
            <UiButton purpose="quiet" size="xs" icon="external" aria-label="Open site" @click.stop="openSite(row)" />
            <UiButton purpose="quiet" size="xs" icon="radar" aria-label="Run new scan" @click.stop="scanSite(row.url)" />
            <UiButton purpose="secondary" size="xs" icon="add" @click.stop="openRegister(row.url)">
              Register
            </UiButton>
          </template>
        </div>
      </template>
    </UiTable>
  </div>
</template>
