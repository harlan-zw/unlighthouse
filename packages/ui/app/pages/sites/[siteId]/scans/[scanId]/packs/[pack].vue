<script setup lang="ts">
import type { Component } from 'vue'
import PackPageShell from '~/features/scan/components/PackPageShell.vue'
import A11yWidget from '~/features/scan/components/packs/A11yWidget.vue'
import AgenticBrowsingWidget from '~/features/scan/components/packs/AgenticBrowsingWidget.vue'
import BestPracticesWidget from '~/features/scan/components/packs/BestPracticesWidget.vue'
import CruxWidget from '~/features/scan/components/packs/CruxWidget.vue'
import CwvWidget from '~/features/scan/components/packs/CwvWidget.vue'
import GenericPackReport from '~/features/scan/components/packs/GenericPackReport.vue'
import ImagesWidget from '~/features/scan/components/packs/ImagesWidget.vue'
import InsightsWidget from '~/features/scan/components/packs/InsightsWidget.vue'
import JsBundleWidget from '~/features/scan/components/packs/JsBundleWidget.vue'
import SeoBasicsWidget from '~/features/scan/components/packs/SeoBasicsWidget.vue'
import { useScanBase } from '~/features/scan/route-context'

definePageMeta({ layout: 'scan' })

// Bespoke widget per built-in pack (D-045). Packs with no entry here — custom
// packs installed via `unlighthouse.config.ts`'s `packs` channel (D-046), or
// any future built-in that hasn't earned a dedicated widget yet — fall back
// to GenericPackReport, which renders severityCounts / findings / raw JSON
// depending on what shape the report actually has.
const WIDGETS: Record<string, Component> = {
  'cwv': CwvWidget,
  'insights': InsightsWidget,
  'images': ImagesWidget,
  'js-bundle': JsBundleWidget,
  'a11y-quick-wins': A11yWidget,
  'seo-basics': SeoBasicsWidget,
  'best-practices': BestPracticesWidget,
  'crux': CruxWidget,
  'agentic-browsing': AgenticBrowsingWidget,
}

const route = useRoute()
const { scanId, scanBase } = useScanBase()
const packName = computed(() => route.params.pack as string)

// pack.list drives both tab metadata (title, version badge) and pack-name
// validation — a route param that doesn't match a registered pack gets a
// clean empty state instead of a PACK_NOT_FOUND error banner from pack.run.
const { data: listData, status: listStatus, error: listError, refresh: refreshList } = useApiQuery('pack.list', () => ({}))
const packMeta = computed(() => listData.value?.packs.find(p => p.name === packName.value) ?? null)
const packKnown = computed(() => !!packMeta.value)
const packUnknown = computed(() => listStatus.value === 'success' && !packMeta.value)

const { data: runData, status: runStatus, error: runError, refresh: refreshRun } = useApiQuery(
  'pack.run',
  () => ({ scanId: scanId.value, pack: packName.value }),
  { enabled: packKnown },
)

const report = computed(() => runData.value?.report ?? null)
const Widget = computed(() => WIDGETS[packName.value] ?? GenericPackReport)
const title = computed(() => packMeta.value?.ui.tab ?? packName.value)

// Combined status for the shell: pending while pack.list is still resolving
// (we don't yet know if the pack is valid), otherwise the pack.run status.
// `packKnown` flipping true and pack.run's `enabled` flipping true land in
// the same tick, but nuxt-use-query doesn't start the fetch until the next
// one — until pack.run reaches a terminal state, that gap ('idle' or any
// other non-terminal value) means "about to load", not "no report", so
// treat it as pending too rather than letting PackPageShell read it as the
// empty state.
const shellStatus = computed(() => {
  if (listStatus.value === 'pending' || listStatus.value === 'idle')
    return 'pending'
  if (packKnown.value && runStatus.value !== 'success' && runStatus.value !== 'error')
    return 'pending'
  return runStatus.value
})
const shellError = computed(() => listError.value ?? runError.value)
function retry() {
  refreshList()
  refreshRun()
}
</script>

<template>
  <div v-if="packUnknown" class="space-y-6">
    <UiPageHeader :title="packName" flush />
    <UiEmptyState
      icon="inbox"
      :title="`Pack ${packName} is not registered for this scan`"
      description="Check pack.list for the packs available here, or confirm the pack name in unlighthouse.config.ts's packs channel."
      compact
    />
  </div>

  <PackPageShell
    v-else
    :title="title"
    :pack="packName"
    :version="packMeta?.version"
    :status="shellStatus"
    :error="shellError"
    :on-retry="retry"
    :report="report"
    :empty-message="`No ${title} data available. Run a scan first.`"
    loading-message="Loading pack data..."
  >
    <component :is="Widget" :report="report" :scan-base="scanBase" />
  </PackPageShell>
</template>
