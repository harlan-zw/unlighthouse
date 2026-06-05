<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

// Presentational filter primitive: a popover combining a dimension search,
// dimension shortcuts, a branded toggle, saved filters and preset filters.
// All data is prop-driven and actions are emitted — the consumer owns
// persistence and what each dimension/preset means.

interface DimensionOption {
  label: string
  value: string
  icon: string
}
interface SavedFilter {
  id: string
  label: string
}
interface PresetFilter {
  id: string
  label: string
  icon?: string
}
interface BrandedOption {
  label: string
  value: string
  icon?: string
}

const {
  dimensions = [],
  dimensionValues = {},
  brandedOptions = [],
  savedFilters = [],
  presetFilters = [],
  activePreset = '',
  activeCount = 0,
  label = 'Filter',
  searchable = true,
  searchPlaceholder = 'Search…',
} = defineProps<{
  /** Dimension shortcuts (Query/Page/Country/Device). Clicking opens that dimension's `#picker` sub-view. */
  dimensions?: DimensionOption[]
  /** Current applied value per dimension (keyed by dimension value) — shown as a trailing label on the row. */
  dimensionValues?: Record<string, string>
  /** Branded segmented toggle options; omit to hide the section. */
  brandedOptions?: BrandedOption[]
  /** User-persisted saved filters. */
  savedFilters?: SavedFilter[]
  /** Built-in preset filters. */
  presetFilters?: PresetFilter[]
  /** The currently-applied preset id — shown active in the list. */
  activePreset?: string
  /** Count shown in the trigger badge. */
  activeCount?: number
  /** Trigger label. */
  label?: string
  /** Show the in-popover search input. Disable when the consumer renders its own. */
  searchable?: boolean
  /** Placeholder for the search input. */
  searchPlaceholder?: string
}>()

const emit = defineEmits<{
  selectDimension: [value: string]
  applySaved: [id: string]
  removeSaved: [id: string]
  applyPreset: [id: string]
  save: []
}>()
const search = defineModel<string>('search', { default: '' })
const branded = defineModel<string>('branded', { default: '' })

const open = ref(false)

// Two-level popover: selecting a dimension row swaps the menu for that
// dimension's value picker (rendered via the `#picker` slot) with a back
// affordance, matching the seogets filter UX. Reset when the popover closes.
const activeDimension = ref('')
const activeDimensionLabel = computed(() => dimensions.find(d => d.value === activeDimension.value)?.label ?? '')
const backBtn = ref<HTMLButtonElement | null>(null)
const dimensionsRoot = ref<HTMLElement | null>(null)

function openDimension(value: string) {
  activeDimension.value = value
  emit('selectDimension', value)
}
function closeDimension() {
  activeDimension.value = ''
}

// Keep keyboard focus inside the popover when the sub-view swaps: focus the
// back affordance on entering a dimension, and return focus to the originating
// dimension row when leaving (falling back to the dimensions group).
watch(activeDimension, async (value, prev) => {
  await nextTick()
  if (value) {
    backBtn.value?.focus()
  }
  else if (prev) {
    const row = dimensionsRoot.value?.querySelector<HTMLButtonElement>(`[data-dimension="${prev}"]`)
    ;(row ?? dimensionsRoot.value?.querySelector<HTMLButtonElement>('button'))?.focus()
  }
})

watch(open, (v) => {
  if (!v)
    activeDimension.value = ''
})
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start', side: 'bottom', sideOffset: 8 }">
    <button
      type="button"
      :aria-label="activeCount ? `Filter (${activeCount} active)` : 'Filter'"
      :aria-expanded="open"
      class="cursor-pointer inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary outline-none"
      :class="open || activeCount ? 'bg-elevated text-default' : 'text-muted hover:text-default hover:bg-[var(--ui-bg-elevated)]/50'"
    >
      <UiIcon name="i-lucide-filter" class="size-3.5" aria-hidden="true" />
      <span>{{ label }}</span>
      <span
        v-if="activeCount"
        class="min-w-4 px-1 h-4 inline-flex items-center justify-center rounded-full bg-primary text-inverted text-mini font-semibold tabular-nums"
      >{{ activeCount }}</span>
    </button>

    <template #content>
      <div class="w-[270px] py-1.5">
        <!-- Dimension value-picker sub-view: replaces the menu while a
             dimension is active, with a back affordance. -->
        <template v-if="activeDimension">
          <button
            ref="backBtn"
            type="button"
            :aria-label="`Back to filters, from ${activeDimensionLabel}`"
            class="cursor-pointer w-full flex items-center gap-1.5 px-3 py-[5px] text-xs font-medium text-muted hover:text-default transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            @click="closeDimension"
          >
            <UiIcon name="i-lucide-chevron-left" class="size-3.5 shrink-0" aria-hidden="true" />
            <span>{{ activeDimensionLabel }}</span>
          </button>
          <div class="mx-3 my-1.5 border-t border-default/50" role="separator" />
          <div class="px-2.5 pb-1">
            <slot name="picker" :dimension="activeDimension" :close="closeDimension" />
          </div>
        </template>

        <template v-else>
          <!-- Search -->
          <div v-if="searchable" class="px-2 pb-1.5">
            <UInput
              v-model="search"
              :placeholder="searchPlaceholder"
              :aria-label="searchPlaceholder"
              icon="i-lucide-search"
              size="xs"
              class="w-full"
              autocomplete="off"
            />
          </div>

          <!-- Facets slot (consumer-rendered value editors, e.g. country/device) -->
          <div v-if="$slots.facets" class="px-2.5 pb-1.5">
            <slot name="facets" />
          </div>

          <!-- Dimension shortcuts -->
          <div v-if="dimensions.length" ref="dimensionsRoot" role="group" aria-label="Filter dimensions">
            <button
              v-for="d in dimensions"
              :key="d.value"
              type="button"
              :data-dimension="d.value"
              :aria-label="`${d.label}${dimensionValues[d.value] ? `: ${dimensionValues[d.value]}` : ''}`"
              class="cursor-pointer w-full flex items-center gap-2 px-3 py-[5px] text-xs text-muted hover:text-default hover:bg-[var(--ui-bg-elevated)]/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              @click="openDimension(d.value)"
            >
              <UiIcon :name="d.icon" class="size-3.5 shrink-0 text-dimmed" aria-hidden="true" />
              <span class="flex-1 text-left">{{ d.label }}</span>
              <span v-if="dimensionValues[d.value]" class="text-default font-medium truncate max-w-28">{{ dimensionValues[d.value] }}</span>
              <UiIcon name="i-lucide-chevron-right" class="size-3 shrink-0 text-dimmed" aria-hidden="true" />
            </button>
          </div>

          <!-- Branded toggle -->
          <template v-if="brandedOptions.length">
            <div class="mx-3 my-1.5 border-t border-default/50" role="separator" />
            <div class="px-3 pb-1">
              <MetricLabel aria-hidden="true">
                Branded
              </MetricLabel>
            </div>
            <div class="px-2.5 pb-1">
              <ToggleGroupRoot
                :model-value="branded"
                type="single"
                aria-label="Branded filter"
                class="flex items-center gap-1 p-0.5 rounded-md bg-[var(--ui-bg-elevated)]/60"
                @update:model-value="(v: unknown) => { if (typeof v === 'string' && v) branded = v }"
              >
                <ToggleGroupItem
                  v-for="b in brandedOptions"
                  :key="b.value"
                  :value="b.value"
                  class="cursor-pointer flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-mini font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  :class="branded === b.value
                    ? 'bg-default text-default shadow-sm'
                    : 'text-muted hover:text-default'"
                >
                  <UiIcon v-if="b.icon" :name="b.icon" class="size-3" aria-hidden="true" />
                  <span>{{ b.label }}</span>
                </ToggleGroupItem>
              </ToggleGroupRoot>
            </div>
          </template>

          <!-- Saved filters -->
          <div class="mx-3 my-1.5 border-t border-default/50" role="separator" />
          <div class="px-3 pb-1 flex items-center justify-between">
            <MetricLabel aria-hidden="true">
              Saved Filters
            </MetricLabel>
            <button
              type="button"
              class="cursor-pointer text-mini text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              @click="emit('save')"
            >
              Save current
            </button>
          </div>
          <div v-if="savedFilters.length" role="group" aria-label="Saved filters">
            <div
              v-for="s in savedFilters"
              :key="s.id"
              class="group w-full flex items-center gap-2 px-3 py-[5px] text-xs text-muted hover:bg-[var(--ui-bg-elevated)]/50 transition-colors"
            >
              <button
                type="button"
                class="cursor-pointer flex-1 flex items-center gap-2 text-left hover:text-default outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset rounded"
                @click="emit('applySaved', s.id)"
              >
                <UiIcon name="i-lucide-bookmark" class="size-3.5 shrink-0 text-dimmed" aria-hidden="true" />
                <span class="truncate">{{ s.label }}</span>
              </button>
              <button
                type="button"
                :aria-label="`Remove saved filter ${s.label}`"
                class="cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-dimmed hover:text-error transition-[color,opacity] outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                @click="emit('removeSaved', s.id)"
              >
                <UiIcon name="i-lucide-x" class="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>
          <p v-else class="px-3 pb-1 text-mini text-dimmed leading-snug">
            Add filters and save them to quickly access them later.
          </p>

          <!-- Preset filters -->
          <template v-if="presetFilters.length">
            <div class="mx-3 my-1.5 border-t border-default/50" role="separator" />
            <div class="px-3 pb-1">
              <MetricLabel aria-hidden="true">
                Preset Filters
              </MetricLabel>
            </div>
            <div role="group" aria-label="Preset filters">
              <button
                v-for="p in presetFilters"
                :key="p.id"
                type="button"
                :aria-pressed="activePreset === p.id"
                class="cursor-pointer w-full flex items-center gap-2 px-3 py-[5px] text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset relative"
                :class="activePreset === p.id
                  ? 'text-default bg-elevated'
                  : 'text-muted hover:text-default hover:bg-[var(--ui-bg-elevated)]/50'"
                @click="emit('applyPreset', p.id)"
              >
                <span
                  v-if="activePreset === p.id"
                  class="absolute left-0 inset-y-0.5 w-[2px] rounded-full bg-primary"
                  aria-hidden="true"
                />
                <UiIcon :name="p.icon ?? 'i-lucide-sparkles'" class="size-3.5 shrink-0 text-dimmed" aria-hidden="true" />
                <span class="flex-1 text-left">{{ p.label }}</span>
                <UiIcon
                  v-if="activePreset === p.id"
                  name="i-lucide-check"
                  class="size-3 text-primary"
                  aria-hidden="true"
                />
              </button>
            </div>
          </template>
        </template>
      </div>
    </template>
  </UPopover>
</template>
