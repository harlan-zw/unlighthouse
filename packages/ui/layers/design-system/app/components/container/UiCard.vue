<script setup lang="ts">
import type { EjectChat, EjectLink, EjectMcp } from '../element/eject-menu'
import { useElementSize } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { useSquircleFallback } from '../../composables/useSquircleFallback'
import { squircleSvgPath } from '../../utils/squircle'

const {
  size = 'md',
  emphasis = false,
  chat,
  curl,
  mcp,
  schema,
} = defineProps<{
  title?: string
  description?: string
  divided?: boolean
  /** 'default' = solid bg-elevated (forms, settings). 'subtle' = translucent bg (data displays, lists). */
  variant?: 'default' | 'subtle'
  /** 'xs' = tight (inline/nested). 'sm' = compact (lists, dense tables). 'md' = default. 'lg' = spacious (hero/feature cards). */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /**
   * The single sanctioned in-page contrast move: lift + primary-tinted top
   * bevel (--elevation-emphasis) that survives the dashboard's raised→flat
   * remap. Budget: at most ONE per page — two emphasis cards means neither is.
   */
  emphasis?: boolean
  /**
   * Card-grain eject affordance: renders a `<UiEjectMenu>` in the header so the
   * card's own data can be opened in AI chat (or copied as code) without a
   * floating page-level button. The card title supplies the context that a
   * generic "Ask AI" button lacked, so the seed reads as scoped to this card.
   * Pass `chat` with `entity` + `filter` (siteId) + `autoSend: true` to open the
   * in-place ProChatPanel and fire the seed immediately. Only renders in the
   * auto-header (title/actions driven); cards using a custom `#header` slot place
   * the menu themselves.
   */
  chat?: EjectChat
  curl?: string
  mcp?: EjectMcp | string
  schema?: EjectLink
}>()

const slots = defineSlots<{
  default?: () => unknown
  header?: () => unknown
  actions?: () => unknown
}>()

const hasEject = computed(() => !!(chat || curl || mcp || schema))

// The default (md) size reads the --density-card-padding knob at sm+ so card
// density tunes centrally per context (:root / .dashboard-theme). The explicit
// sizes (xs/sm/lg) are local intent and stay fixed.
const headerClass = {
  xs: 'px-2.5 py-2',
  sm: 'px-3 sm:px-4 py-3',
  md: 'px-4 sm:px-(--density-card-padding) py-4',
  lg: 'px-6 sm:px-8 py-5',
}[size]

const bodyClass = {
  xs: 'p-2.5',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-(--density-card-padding)',
  lg: 'p-6 sm:p-8',
}[size]

const bodyDividedClass = {
  xs: 'divide-y divide-[var(--ui-border)] [&>*]:p-2.5',
  sm: 'divide-y divide-[var(--ui-border)] [&>*]:p-3 [&>*]:sm:p-4',
  md: 'divide-y divide-[var(--ui-border)] [&>*]:p-4 [&>*]:sm:p-(--density-card-padding)',
  lg: 'divide-y divide-[var(--ui-border)] [&>*]:p-6 [&>*]:sm:p-8',
}[size]

// Size stays driven by the card's `size` prop (not the theme-resizing role
// tokens); only the weight routes through the .font-strong token so it tunes
// centrally with the rest of the type system.
const titleClass = {
  xs: 'text-xs font-strong text-default',
  sm: 'text-sm font-strong text-default',
  md: 'font-strong text-default',
  lg: 'text-lg font-strong text-default',
}[size]

// Figma-squircle corners. Chrome gets the native `corner-shape: squircle`
// (global.css), so `rounded-xl` (0.75rem ≈ 12px) is both the SSR shape and the
// final shape — no JS, no morph. Safari/Firefox fall back to a generated
// clip-path (clips bg + content to the squircle) plus an SVG hairline overlay
// whose stroke is `var(--ui-border)`, so it follows the curve and tracks the
// theme for free. The CSS border is hidden in that case so the clip can't
// slice it.
const RADIUS = 12
const cardRef = useTemplateRef<HTMLElement>('card')
const { width, height } = useElementSize(cardRef)
const { enabled: squircle } = useSquircleFallback()

const path = computed(() => squircle.value
  ? squircleSvgPath(width.value, height.value, { radius: RADIUS, smoothing: 0.6 })
  : '')
// Emphasis shadow rides the inner card. In squircle-fallback browsers the
// clip-path swallows the ambient drop shadow (inset bevel survives the clip) —
// acceptable degradation; Chrome renders the full preset.
const cardStyle = computed(() => {
  const style: Record<string, string> = {}
  if (path.value) {
    style.clipPath = `path("${path.value}")`
    style.borderColor = 'transparent'
  }
  if (emphasis)
    style.boxShadow = 'var(--elevation-emphasis)'
  return Object.keys(style).length ? style : undefined
})
</script>

<template>
  <div class="relative flex flex-col">
    <div
      ref="card"
      class="group/card relative overflow-hidden rounded-xl border flex flex-col flex-1"
      :class="[
        emphasis ? 'border-primary-400/25' : 'border-default',
        emphasis
          ? 'bg-[var(--ui-bg-elevated)]/50'
          : variant === 'subtle' ? 'bg-[var(--ui-bg-elevated)]/5' : 'bg-[var(--ui-bg-elevated)]/35',
      ]"
      :style="cardStyle"
    >
      <!-- Header slot -->
      <div v-if="slots.header" class="relative border-b border-default shrink-0" :class="headerClass">
        <slot name="header" />
      </div>
      <!-- Auto header from title/description -->
      <div v-else-if="title || slots.actions || hasEject" class="relative border-b border-default shrink-0 flex items-start justify-between gap-3" :class="headerClass">
        <div class="min-w-0">
          <h3 v-if="title" class="break-words" :class="[titleClass]">
            {{ title }}
          </h3>
          <p v-if="description" class="text-sm text-muted mt-1">
            {{ description }}
          </p>
        </div>
        <div v-if="slots.actions || hasEject" class="flex items-center gap-1 shrink-0">
          <slot name="actions" />
          <UiEjectMenu
            v-if="hasEject"
            :chat="chat"
            :curl="curl"
            :mcp="mcp"
            :schema="schema"
            class="-mr-1"
          />
        </div>
      </div>

      <!-- A custom #header owns its own actions row, so the eject can't sit in
           it. When chat/eject props are set alongside #header, surface a
           hover-revealed ⋯ in the card's top-right corner instead (same affordance
           as UiEjectOverlay). Always-visible on touch / for keyboard users. -->
      <div
        v-if="hasEject && slots.header"
        class="absolute top-2.5 right-2.5 z-10 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <UiEjectMenu :chat="chat" :curl="curl" :mcp="mcp" :schema="schema" />
      </div>

      <div
        data-card-body class="relative flex-1 flex flex-col"
        :class="[divided ? bodyDividedClass : bodyClass]"
      >
        <slot />
      </div>
    </div>

    <!-- Squircle hairline border (fallback browsers only). Stroke reads the
         live token so it tracks the theme; non-scaling so it stays 1px. -->
    <svg
      v-if="path"
      class="pointer-events-none absolute inset-0 size-full"
      :viewBox="`0 0 ${width} ${height}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        :d="path"
        fill="none"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        style="stroke: var(--ui-border)"
      />
    </svg>
  </div>
</template>
