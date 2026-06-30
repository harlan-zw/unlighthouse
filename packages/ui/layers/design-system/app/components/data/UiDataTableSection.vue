<script setup lang="ts" generic="T extends Record<string, any>">
import type { SortingState } from '@tanstack/vue-table'
import type { UiIcon } from '../../shared/ui-icons'
import type { UiTableProps } from './UiTable.vue'

const {
  pending = false,
  rows,
  total,
  columns,
  error,
  pageSize = 12,
  searchable = true,
  searchPlaceholder = 'Search…',
  emptyIcon = 'search',
  emptyTitle = 'No results found',
  emptyDescription = '',
  itemLabel = 'items',
  manualPagination = true,
  manualSorting = false,
  rowHover = true,
  rowClickable = false,
  rowId,
  label,
  filtersActive = false,
  formatTotal,
} = defineProps<{
  pending?: boolean
  rows: T[]
  total: number
  columns: UiTableProps<T>['columns']
  error?: any
  pageSize?: number
  searchable?: boolean
  searchPlaceholder?: string
  emptyIcon?: UiIcon
  emptyTitle?: string
  emptyDescription?: string
  itemLabel?: string
  manualPagination?: boolean
  manualSorting?: boolean
  rowHover?: boolean
  rowClickable?: boolean
  rowId?: UiTableProps<T>['rowId']
  /** Accessible name for the table (passed through to <caption>). */
  label?: string
  /** Whether any non-search filter is currently active. Drives empty-state copy. */
  filtersActive?: boolean
  /** Caller-supplied number formatter for the pagination "X items total" caption. Defaults to toLocaleString. */
  formatTotal?: (n: number) => string
}>()

const emit = defineEmits<{
  retry: []
  sortColumn: [column: string]
  rowClick: [row: T]
}>()

const totalDisplay = computed(() => formatTotal ? formatTotal(total) : total.toLocaleString())

const search = defineModel<string>('search', { default: '' })
const page = defineModel<number>('page', { default: 1 })
const sorting = defineModel<SortingState>('sorting', { default: () => [] })
const rowSelection = defineModel<Record<string, boolean>>('rowSelection')
const rowSelectionEnabled = computed(() => rowSelection.value !== undefined)

const showEmpty = computed(() => !pending && !error && rows.length === 0)
const showTable = computed(() => !error && (pending || rows.length > 0))
const showPagination = computed(() => !pending && rows.length > 0 && total > pageSize)
</script>

<template>
  <div data-ui="UiDataTableSection" class="flex flex-col gap-4">
    <slot name="stats" />

    <!-- Filter row -->
    <div v-if="searchable || $slots['filters-leading'] || $slots['filters-trailing']" class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
      <div class="flex items-center gap-1.5 flex-wrap">
        <slot name="filters-leading" />
      </div>
      <div class="flex items-center gap-3">
        <slot name="filters-trailing" />
        <UInput
          v-if="searchable"
          v-model="search"
          type="search"
          class="w-full sm:w-56"
          :placeholder="searchPlaceholder"
          icon="search"
          autocomplete="off"
          size="sm"
          :ui="{ base: 'transition-[width] duration-200 focus-within:w-72' }"
          aria-label="Filter rows"
        >
          <template #trailing>
            <UiButton
              v-if="search !== ''"
              purpose="quiet"
              icon="close"
              size="xs"
              class="rounded-lg"
              aria-label="Clear search"
              @click="search = ''"
            />
          </template>
        </UInput>
      </div>
    </div>

    <slot name="notices" />

    <!-- Error -->
    <div v-if="error" role="alert" aria-live="assertive" class="rounded-xl border border-dashed border-default bg-[var(--ui-bg-elevated)]/5">
      <slot name="error" :error="error">
        <div class="py-10 text-center">
          <p class="text-sm text-error mb-3">
            {{ typeof error === 'string' ? error : (error.message || 'Failed to load') }}
          </p>
          <UiButton size="sm" purpose="secondary" @click="emit('retry')">
            Retry
          </UiButton>
        </div>
      </slot>
    </div>

    <!-- Empty -->
    <div v-else-if="showEmpty" role="status" data-testid="table-empty-state" class="rounded-xl border border-dashed border-default bg-[var(--ui-bg-elevated)]/5 py-16">
      <slot name="empty">
        <div class="text-center max-w-sm mx-auto">
          <UiIcon :name="emptyIcon" class="size-7 text-dimmed mb-3 inline-block" aria-hidden="true" />
          <h3 class="text-sm font-semibold text-default mb-1">
            {{ emptyTitle }}
          </h3>
          <p v-if="search || filtersActive || emptyDescription" class="text-sm text-muted mb-4">
            <template v-if="search">
              No {{ itemLabel }} match “<span class="font-medium text-default">{{ search }}</span>”
            </template>
            <template v-else-if="filtersActive">
              No {{ itemLabel }} match the selected filter
            </template>
            <template v-else>
              {{ emptyDescription }}
            </template>
          </p>
          <slot name="empty-actions">
            <UiButton
              v-if="search"
              size="sm"
              purpose="secondary"
              @click="search = ''"
            >
              Clear search
            </UiButton>
          </slot>
        </div>
      </slot>
    </div>

    <!-- Body: defaults to the table; pass #body to render an alternate view
         (e.g. a card grid) while keeping the search / empty / pagination chrome. -->
    <template v-else-if="showTable">
      <slot name="body" :rows="rows" :pending="pending">
        <div class="rounded-xl border border-default overflow-hidden bg-default">
          <UiTable
            v-model:sorting="sorting"
            v-model:selected="rowSelection"
            :data="rows"
            :columns="columns"
            :page-size="pageSize"
            :row-hover="rowHover"
            :row-clickable="rowClickable"
            :manual-pagination="manualPagination"
            :manual-sorting="manualSorting"
            :enable-sorting="manualSorting"
            :total="total"
            :row-id="rowId"
            :label="label"
            :loading="pending"
            :controlled-selection="rowSelectionEnabled"
            disable-pagination
            @sort-column="(c: string) => emit('sortColumn', c)"
            @row-click="(r: T) => emit('rowClick', r)"
          />
        </div>
      </slot>
    </template>

    <!-- Pagination (sibling: applies to the table and any #body view) -->
    <div v-if="showPagination" class="flex items-center justify-between gap-4 pt-2">
      <p class="text-sm text-muted">
        <slot name="pagination-leading">
          <span class="font-medium text-default">{{ totalDisplay }}</span> {{ itemLabel }} total
        </slot>
      </p>
      <UPagination
        v-model:page="page"
        size="sm"
        :items-per-page="pageSize"
        :total="total"
        :sibling-count="1"
      />
    </div>

    <slot name="footer" />
  </div>
</template>
