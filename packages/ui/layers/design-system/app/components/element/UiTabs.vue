<script setup lang="ts" generic="T extends string = string">
import type { ComponentPublicInstance } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import { useRoute } from 'nuxt/app'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { NuxtLink } from '#components'
/**
 * Horizontal tab strip. Owned primitive (ejected from `UTabs`) — the tab
 * *intents* in DESIGN.md map to a semantic `kind`, and the responsive + a11y
 * behaviour lives in one place. Two modes, one look:
 *
 *  - **Route mode** (`:links`, each with a `to`): tabs that change the URL and
 *    render via `<NuxtPage />`. This is *navigation*, so it renders a `<nav>` of
 *    `NuxtLink`s with `aria-current="page"` (set by NuxtLink); active derives
 *    from the route and navigation is `:to` (no `@click`/`router.push`).
 *
 *  - **Select mode** (`:items` + `v-model`): an in-page view switch that flips a
 *    reactive value the page reads (panels rendered by the consumer via `v-if`).
 *    Renders a `role="tablist"` of `<button role="tab">` with `aria-selected`.
 *
 * Both modes share `kind`:
 *  - `kind="page"`   — primary strip under `ProPageHeader`; white underline on
 *                      the active tab (text-level emphasis, never the CTA violet).
 *  - `kind="subnav"` — nested one level below; quiet `bg-elevated` pill.
 *
 * For a compact, enclosed segmented toggle in a section header, use `UiTogglePill`.
 * For tabs that need the primitive to render panel slots, use `UTabs`.
 */

export interface UiTabLink {
  label: string
  /** Any NuxtLink target: a path string or a `{ name, params }` route object. */
  to: RouteLocationRaw
  disabled?: boolean
  /** Route tab links default to no prefetch so tabs never start data work on hover/visibility. */
  prefetch?: boolean
  /**
   * Extra classes for this tab (e.g. `text-dimmed` to mark a tab whose feature
   * isn't set up yet). Applied alongside the shared tab styling; the active
   * state still wins via `exact-active-class`.
   */
  class?: string
}
export interface UiTabItem<T extends string = string> {
  label: string
  value: T
  disabled?: boolean
  /** Stable id for the tab control when the consumer renders a tabpanel. */
  tabId?: string
  /** Stable id of the tabpanel controlled by this tab. */
  panelId?: string
}

const { kind = 'page', links, items, ariaLabel = 'Tabs' } = defineProps<{
  kind?: 'page' | 'subnav'
  /** Route mode: NuxtLink tabs; active derives from the route. */
  links?: UiTabLink[]
  /** Select mode: in-page selection bound to `v-model`. Pass with v-model, not `links`. */
  items?: UiTabItem<T>[]
  /** Accessible name for the nav landmark / tablist. */
  ariaLabel?: string
}>()

defineSlots<{
  /** Trailing content inside a tab (e.g. a lock icon). Receives the link/item. */
  trailing?: (props: { link: UiTabLink | UiTabItem<T> }) => unknown
}>()

/** Select-mode value. Ignored in route mode. */
const model = defineModel<T>()
const route = useRoute()

const isSelect = computed(() => !!items)
const enabledItems = computed(() => items?.filter(i => !i.disabled) ?? [])

// Root is the horizontal scroll container; one ref drives both keyboard roving
// (select mode) and the overflow-fade affordance (both modes).
const rootEl = ref<HTMLElement>()
function setRoot(el: Element | ComponentPublicInstance | null) {
  const root = el && '$el' in el ? el.$el : el
  rootEl.value = root instanceof HTMLElement ? root : undefined
}

// Edge fades: only show the gradient on a side that actually has more tabs to
// reach. Self-activates when the strip overflows (i.e. narrow / mobile widths)
// and clears when it fits, so desktop never masks.
const fadeStart = ref(false)
const fadeEnd = ref(false)
function updateFades() {
  const el = rootEl.value
  if (!el)
    return
  fadeStart.value = el.scrollLeft > 1
  fadeEnd.value = Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 1
}

onMounted(() => {
  useEventListener(rootEl, 'scroll', updateFades, { passive: true })
  useResizeObserver(rootEl, () => {
    updateFades()
    scrollSelectedIntoView()
  })
  scrollSelectedIntoView()
})
watch(() => (items?.length ?? 0) + (links?.length ?? 0), scrollSelectedIntoView)

// Bring the active tab into view on load and after URL/model-driven selection.
// This is especially important for grouped strips where the selected item may
// live beyond the narrow viewport.
function scrollSelectedIntoView() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const root = rootEl.value
      const selected = root?.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"], .router-link-exact-active')
      if (root && selected) {
        const rootBounds = root.getBoundingClientRect()
        const selectedBounds = selected.getBoundingClientRect()
        const selectedLeft = selectedBounds.left - rootBounds.left + root.scrollLeft
        root.scrollLeft = Math.max(0, selectedLeft - (root.clientWidth - selectedBounds.width) / 2)
      }
      updateFades()
    })
  })
}
watch(model, scrollSelectedIntoView)
watch(() => route.fullPath, scrollSelectedIntoView, { flush: 'post' })

// Roving tabindex: only the active tab is in the Tab sequence (APG tablist).
// When nothing is selected yet, the first enabled tab is the entry point so the
// tablist stays keyboard-reachable.
function isTabStop(item: UiTabItem<T>): boolean {
  if (item.disabled)
    return false
  if (enabledItems.value.some(enabled => enabled.value === model.value))
    return model.value === item.value
  return item.value === enabledItems.value[0]?.value
}

// Arrow/Home/End move between tabs with automatic activation (switching is
// cheap — the consumer just re-renders a v-if panel). Horizontal orientation.
function onKeydown(e: KeyboardEvent) {
  if (!items || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key))
    return
  const enabled = enabledItems.value
  if (!enabled.length)
    return
  e.preventDefault()
  const current = enabled.findIndex(i => i.value === model.value)
  let nextIdx: number
  if (e.key === 'Home')
    nextIdx = 0
  else if (e.key === 'End')
    nextIdx = enabled.length - 1
  else
    nextIdx = ((current === -1 ? 0 : current) + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length
  const next = enabled[nextIdx]!
  model.value = next.value
  const domIdx = items.findIndex(i => i.value === next.value)
  nextTick(() => rootEl.value?.querySelectorAll<HTMLElement>('[role="tab"]')[domIdx]?.focus())
}

// Shared styling so route + select tabs are visually identical; `kind` and
// active-state are the only differences.
const baseClass = 'group/uitab relative inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 text-sm font-medium text-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-sm'
const kindBase = computed(() => kind === 'page'
  ? 'px-1 pb-2.5 -mb-px border-b-2 border-transparent'
  : 'px-2.5 py-1 rounded-md')
const activeClass = computed(() => kind === 'page'
  ? 'text-highlighted border-inverted!'
  : 'bg-elevated text-default')
</script>

<template>
  <component
    :is="isSelect ? 'div' : 'nav'"
    :ref="setRoot"
    :role="isSelect ? 'tablist' : undefined"
    :aria-orientation="isSelect ? 'horizontal' : undefined"
    :aria-label="ariaLabel"
    class="ui-tabs flex items-stretch overflow-x-auto"
    :class="kind === 'page' ? 'gap-4 border-b border-default' : 'gap-0 w-fit max-w-full rounded-lg bg-muted p-0.5'"
    :data-fade-start="fadeStart || undefined"
    :data-fade-end="fadeEnd || undefined"
    @keydown="isSelect ? onKeydown($event) : undefined"
  >
    <!-- Select mode: in-page view switch -->
    <template v-if="isSelect">
      <button
        v-for="item in items"
        :id="item.tabId"
        :key="item.value"
        type="button"
        role="tab"
        :aria-controls="item.panelId"
        :aria-selected="model === item.value"
        :tabindex="isTabStop(item) ? 0 : -1"
        :disabled="item.disabled"
        class="cursor-pointer"
        :class="[
          baseClass,
          kindBase,
          model === item.value ? activeClass : '',
          item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-default',
        ]"
        @click="model = item.value"
      >
        <span>{{ item.label }}</span>
        <slot name="trailing" :link="item" />
      </button>
    </template>

    <!-- Route mode: navigation -->
    <template v-else>
      <component
        :is="link.disabled ? 'span' : NuxtLink"
        v-for="link in links"
        :key="link.label"
        :to="link.disabled ? undefined : link.to"
        :prefetch="link.disabled ? undefined : (link.prefetch ?? false)"
        :aria-disabled="link.disabled || undefined"
        :tabindex="link.disabled ? -1 : undefined"
        :exact-active-class="link.disabled ? undefined : activeClass"
        :class="[
          baseClass,
          kindBase,
          link.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-default',
          link.class,
        ]"
      >
        <span>{{ link.label }}</span>
        <slot name="trailing" :link="link" />
      </component>
    </template>
  </component>
</template>

<style scoped>
/* Hide the horizontal-scroll bar on mobile — the tabs scroll, no chrome. */
.ui-tabs {
  scrollbar-width: none;
}
.ui-tabs::-webkit-scrollbar {
  display: none;
}

/* Edge fade affordance: mask the side(s) with more tabs off-screen so the strip
   reads as scrollable. Toggled by JS via data-fade-* (set only while overflowing,
   so it never masks on desktop). --fade is the fade ramp width. */
.ui-tabs {
  --fade: 1.75rem;
}
.ui-tabs[data-fade-end] {
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
}
.ui-tabs[data-fade-start] {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--fade));
  mask-image: linear-gradient(to right, transparent, #000 var(--fade));
}
.ui-tabs[data-fade-start][data-fade-end] {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
}
</style>
