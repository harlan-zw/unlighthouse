<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'
import { computed, onMounted, ref } from 'vue'
import { NuxtLink } from '#components'
import { getIconColor } from '../../utils/icon-color'

const {
  title,
  icon,
  iconColor,
  tooltip,
  metricLabel,
  items,
  loading,
  loadingCount = 5,
  viewMoreTo,
  viewMoreLabel = 'View all',
  emptyIcon,
  emptyText = 'No data available',
  barValue,
  barTotal,
  barColor = 'bg-pro',
  itemTo,
  subtle = false,
} = defineProps<{
  title?: string
  icon?: UiIcon
  iconColor?: string
  /** Render the title as a quieter sub-tier (smaller + muted) for nested lists. */
  subtle?: boolean
  tooltip?: string
  metricLabel?: string
  items?: any[]
  loading?: boolean
  loadingCount?: number
  viewMoreTo?: string | Record<string, any>
  viewMoreLabel?: string
  emptyIcon?: UiIcon
  emptyText?: string
  /** Accessor fn to get bar value from item. When set, renders a % fill bar behind each row. */
  barValue?: (item: any) => number
  /** Total for bar percentage calculation. If omitted, auto-sums barValue across all items. */
  barTotal?: number
  /** Bar color class (default: 'bg-pro') */
  barColor?: string
  /** Accessor fn for row link target. When set, each row becomes a NuxtLink with a trailing chevron. */
  itemTo?: (item: any) => string | Record<string, any> | undefined | null
}>()

defineSlots<{
  'default'?: (props: { item: any, index: number }) => any
  'header-trailing'?: () => any
  'empty'?: () => any
  'footer'?: () => any
}>()

// Treat SSR as loading to avoid hydration mismatch when data arrives client-side
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
const isLoading = computed(() => loading || (!hydrated.value && !items?.length))

const computedBarTotal = computed(() => {
  if (barTotal != null)
    return barTotal
  if (!barValue || !items?.length)
    return 0
  return items.reduce((sum, item) => sum + barValue!(item), 0)
})

function barPct(item: any): number {
  if (!barValue)
    return 0
  const total = computedBarTotal.value
  return total > 0 ? (barValue(item) / total) * 100 : 0
}

const hasSemanticColor = computed(() => !!iconColor)
const iconClasses = computed(() => hasSemanticColor.value ? getIconColor(iconColor!) : null)
const titleClass = computed(() => subtle ? 'text-xs font-medium text-muted' : 'text-sm font-medium')
</script>

<template>
  <div class="flex flex-col" :aria-busy="isLoading">
    <!-- Header -->
    <div v-if="title || icon || $slots['header-trailing']" class="flex items-center justify-between px-1 pb-2.5">
      <div v-if="title || icon" class="flex items-center gap-2">
        <div v-if="icon && hasSemanticColor" class="p-1 rounded-md" :class="iconClasses!.bg">
          <UiIcon :name="icon" class="size-3.5" :class="iconClasses!.text" />
        </div>
        <UiNavIcon v-else-if="icon" :icon="icon" />
        <!-- UiHelpLabel renders its text through UiTooltip, whose root is a
             reka TooltipProvider with no DOM node — a fallthrough `class` would
             be dropped. Wrap it in a real span so the title size/tone lands. -->
        <span v-if="title && tooltip" :class="titleClass">
          <UiHelpLabel :text="title" :tooltip="tooltip" />
        </span>
        <span v-else-if="title" :class="titleClass">{{ title }}</span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <slot name="header-trailing">
          <span v-if="metricLabel" class="text-xs text-dimmed">{{ metricLabel }}</span>
        </slot>
        <NuxtLink
          v-if="viewMoreTo"
          :to="viewMoreTo"
          class="inline-flex items-center gap-1 text-xs text-muted hover:text-default transition-colors group/link"
        >
          {{ viewMoreLabel }}
          <UiIcon name="next" class="size-3 transition-transform group-hover/link:translate-x-0.5" aria-hidden="true" />
        </NuxtLink>
      </div>
    </div>

    <div class="rounded-lg border border-default bg-elevated/50 flex flex-col flex-1 overflow-hidden">
      <!-- Loading -->
      <div v-if="isLoading" class="px-3 py-3 space-y-1">
        <UiSkeleton :lines="loadingCount" :base="180" :range="80" />
      </div>

      <!-- Empty -->
      <div v-else-if="!items?.length" class="px-4 py-6 text-center flex-1 flex flex-col items-center justify-center">
        <UiIcon v-if="emptyIcon" :name="emptyIcon" class="size-6 text-muted/40 mb-2" aria-hidden="true" />
        <p class="text-sm text-dimmed">
          <slot name="empty">
            {{ emptyText }}
          </slot>
        </p>
      </div>

      <!-- Items -->
      <div v-else class="flex-1 p-1.5 space-y-1">
        <component
          :is="itemTo && itemTo(item) ? NuxtLink : 'div'"
          v-for="(item, index) in items"
          :key="item?.id ?? item?.key ?? item?.path ?? item?.url ?? index"
          :to="itemTo ? itemTo(item) || undefined : undefined"
          class="relative flex items-center gap-2 py-1 px-2.5 rounded-lg group hover:bg-accented transition-colors"
        >
          <div
            v-if="barValue"
            class="absolute inset-y-0 left-0 rounded-lg opacity-[0.05] dark:opacity-[0.07] pointer-events-none"
            :class="barColor"
            :style="{ width: `${barPct(item)}%` }"
          />
          <div class="relative flex-1 min-w-0 flex items-center justify-between gap-2">
            <slot :item="item" :index="index" />
          </div>
          <UiIcon
            v-if="itemTo && itemTo(item)"
            name="chevron-right"
            class="size-3.5 text-dimmed shrink-0"
            aria-hidden="true"
          />
        </component>
      </div>

      <!-- Footer -->
      <div v-if="$slots.footer && items?.length" class="px-4 pb-3 pt-2">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
