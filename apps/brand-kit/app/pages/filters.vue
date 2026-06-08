<script lang="ts" setup>
// --- FilterMenu demo state ---
const dimensions = [
  { label: 'Query', value: 'query', icon: 'i-lucide-search' },
  { label: 'Page', value: 'page', icon: 'i-lucide-file' },
  { label: 'Country', value: 'country', icon: 'i-lucide-globe' },
  { label: 'Device', value: 'device', icon: 'i-lucide-monitor' },
]
const brandedOptions = [
  { label: 'All', value: 'all' },
  { label: 'Branded', value: 'branded', icon: 'i-lucide-badge-check' },
  { label: 'Non-branded', value: 'non-branded', icon: 'i-lucide-badge' },
]
const presetFilters = [
  { id: 'paa', label: 'People Also Ask', icon: 'i-lucide-message-circle-question' },
  { id: 'long-tail', label: 'Long Tail Keywords', icon: 'i-lucide-list' },
]

const filterSearch = ref('')
const branded = ref('all')
const savedFilters = ref([
  { id: '1', label: 'US mobile · branded' },
  { id: '2', label: 'Blog pages, position 4–10' },
])
const emptySaved = ref<{ id: string, label: string }[]>([])
const lastAction = ref('—')

function onSelectDimension(v: string) {
  lastAction.value = `selectDimension: ${v}`
}
function onApplyPreset(id: string) {
  lastAction.value = `applyPreset: ${id}`
}
function onApplySaved(id: string) {
  lastAction.value = `applySaved: ${id}`
}
function onRemoveSaved(id: string) {
  savedFilters.value = savedFilters.value.filter(s => s.id !== id)
  lastAction.value = `removeSaved: ${id}`
}
function onSave() {
  lastAction.value = 'save'
}
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Data"
      title="Filtering primitives"
      description="The FilterMenu popover for data views. Presentational: state is v-model bound, actions are emitted, the consumer owns meaning and persistence. DateRangePicker covers the period control."
    />

    <KitSection title="FilterMenu" code="v-model:search v-model:branded · emits">
      <div class="space-y-3">
        <div class="flex items-center gap-2 border border-default rounded-md p-2">
          <FilterMenu
            v-model:search="filterSearch"
            v-model:branded="branded"
            :dimensions="dimensions"
            :branded-options="brandedOptions"
            :saved-filters="savedFilters"
            :preset-filters="presetFilters"
            :active-count="savedFilters.length"
            @select-dimension="onSelectDimension"
            @apply-preset="onApplyPreset"
            @apply-saved="onApplySaved"
            @remove-saved="onRemoveSaved"
            @save="onSave"
          />
        </div>
        <p class="text-[13px] text-muted">
          search = <code class="text-default">{{ filterSearch || '(empty)' }}</code> ·
          branded = <code class="text-default">{{ branded }}</code> ·
          last event = <code class="text-default">{{ lastAction }}</code>
        </p>
      </div>
    </KitSection>

    <KitSection title="FilterMenu · empty saved filters" code="savedFilters=[]">
      <div class="flex items-center gap-2 border border-default rounded-md p-2">
        <FilterMenu
          :dimensions="dimensions"
          :branded-options="brandedOptions"
          :saved-filters="emptySaved"
          :preset-filters="presetFilters"
        />
      </div>
    </KitSection>
  </div>
</template>
