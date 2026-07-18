<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'
import { computed, useSlots } from 'vue'

/**
 * UiTooltip
 *
 * Built directly on reka-ui's Tooltip primitives. Skips Nuxt UI's `UTooltip`
 * wrapper because that layer has historically been buggy in dense scenarios
 * (heatmap cells, packed grids).
 *
 * The global `TooltipProvider` is set up once in `app/app.vue`
 * (`<UApp :tooltip="{ delayDuration: 0 }">`) so adjacent tooltips coordinate
 * via `skipDelayDuration` automatically.
 *
 * Defaults match tooltip semantics:
 * - `disableHoverableContent: false` — users can move the pointer into the
 *   tooltip without dismissing it, as required by WCAG 1.4.13.
 */

interface Props {
  /** Plain text body. */
  text?: string
  /** Bold title rendered above description. */
  title?: string
  /** Secondary body text. */
  description?: string
  /** Renders a label with a (?) trigger icon; tooltip mounts on the icon only. */
  label?: string
  size?: keyof typeof sizes
  iconSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  /** Open delay (ms). Falls back to the provider default (0 in this app). */
  delayDuration?: number
  /** Whether the cursor may enter the tooltip body. Default `true` (tooltip semantics). */
  disableHoverableContent?: boolean
  disabled?: boolean
  /**
   * Default-variant trigger element. `'child'` forwards tooltip behavior to
   * the single slotted interactive element. `'button'` wraps non-interactive
   * content in a keyboard-reachable button. `'span'` remains for visual-only
   * hover hints whose information is already exposed another way.
   */
  triggerAs?: 'child' | 'span' | 'button'
}

const {
  text,
  title,
  description,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  disableHoverableContent = false,
  disabled = false,
  size = 'md',
  triggerAs = 'span',
} = defineProps<Props>()

defineSlots<{
  default?: () => unknown
  text?: () => unknown
}>()

const slots = useSlots()

const hasContent = computed(() =>
  !!(text || title || description || slots.text),
)
</script>

<script lang="ts">
export const sizes = {
  xs: 'max-w-[80px]',
  sm: 'max-w-[160px]',
  md: 'max-w-[250px]',
  lg: 'max-w-[440px]',
  xl: 'max-w-[640px]',
}
</script>

<template>
  <!-- Label variant: tooltip mounts on a small ? icon next to plain text -->
  <span v-if="label" class="inline-flex items-center gap-1">
    <span>{{ label }}</span>
    <TooltipProvider :delay-duration="delayDuration ?? 0" :skip-delay-duration="300" :disable-hoverable-content="disableHoverableContent">
      <TooltipRoot
        :delay-duration="delayDuration"
        :disable-hoverable-content="disableHoverableContent"
        :disabled="disabled || !hasContent"
      >
        <TooltipTrigger
          type="button"
          :aria-label="`More information: ${label}`"
          class="inline-flex size-6 items-center justify-center rounded-full text-dimmed hover:text-muted transition-colors cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <UiIcon name="life-buoy" class="size-3" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            :side="side"
            :align="align"
            :side-offset="sideOffset"
            :collision-padding="8"
            class="ui-tooltip-content"
          >
            <div :class="`text-xs text-left font-normal leading-normal space-y-2 w-max ${sizes[size]}`" data-ui="UiTooltip">
              <template v-if="title">
                <div class="font-semibold">
                  {{ title }}
                </div>
                <div v-if="description" class="text-muted text-xs">
                  {{ description }}
                </div>
              </template>
              <div v-else>
                {{ text }}
              </div>
            </div>
          </TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
  </span>

  <!-- Default variant: tooltip wraps the trigger (slot, or fallback (?) icon) -->
  <TooltipProvider
    v-else
    :delay-duration="delayDuration ?? 0"
    :skip-delay-duration="300"
    :disable-hoverable-content="disableHoverableContent"
  >
    <TooltipRoot
      :delay-duration="delayDuration"
      :disable-hoverable-content="disableHoverableContent"
      :disabled="disabled || !hasContent"
    >
      <TooltipTrigger v-if="$slots.default && triggerAs === 'child'" as-child>
        <slot />
      </TooltipTrigger>
      <TooltipTrigger v-else as-child>
        <span v-if="$slots.default && triggerAs === 'span'" class="inline-block">
          <slot />
        </span>
        <button
          v-else-if="$slots.default"
          type="button"
          :aria-label="text || title || description"
          class="inline-flex min-h-6 min-w-6 cursor-help items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <slot />
        </button>
        <button
          v-else
          type="button"
          aria-label="More information"
          class="inline-flex size-6 cursor-help items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <UiIcon name="life-buoy" color="primary" :size="iconSize || 'md'" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side"
          :align="align"
          :side-offset="sideOffset"
          :collision-padding="8"
          class="ui-tooltip-content"
        >
          <div :class="`text-xs text-left font-normal leading-normal space-y-2 w-max ${sizes[size]}`" data-ui="UiTooltip">
            <slot v-if="$slots.text" name="text" />
            <template v-else-if="title">
              <div class="font-semibold">
                {{ title }}
              </div>
              <div v-if="description" class="text-muted text-xs">
                {{ description }}
              </div>
            </template>
            <div v-else-if="text">
              {{ text }}
            </div>
          </div>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style>
.ui-tooltip-content {
  background-color: var(--ui-bg-elevated);
  /* Popover-tier depth — see global.css. --elevation-popover carries the
     atmospheric shadow + brand bevel; --surface-raised is the top-lit fill. */
  background-image: var(--surface-raised);
  box-shadow: var(--elevation-popover);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  pointer-events: auto;
  z-index: 50;
  will-change: transform, opacity;
  transform-origin: var(--reka-tooltip-content-transform-origin, center);
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
}

/* Reka emits data-state + data-side; hook spring-out enter, soft exit. */
.ui-tooltip-content[data-state="delayed-open"],
.ui-tooltip-content[data-state="instant-open"] {
  animation: ui-tooltip-in 140ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ui-tooltip-content[data-state="closed"] {
  animation: ui-tooltip-out 90ms ease-out;
}

@keyframes ui-tooltip-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(var(--tt-slide-y, 0)) translateX(var(--tt-slide-x, 0));
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0) translateX(0);
  }
}

@keyframes ui-tooltip-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.97);
  }
}

/* Slide-from-trigger directional accents */
.ui-tooltip-content[data-side="top"] { --tt-slide-y: 4px; }
.ui-tooltip-content[data-side="bottom"] { --tt-slide-y: -4px; }
.ui-tooltip-content[data-side="left"] { --tt-slide-x: 4px; }
.ui-tooltip-content[data-side="right"] { --tt-slide-x: -4px; }

@media (prefers-reduced-motion: reduce) {
  .ui-tooltip-content[data-state="delayed-open"],
  .ui-tooltip-content[data-state="instant-open"],
  .ui-tooltip-content[data-state="closed"] {
    animation: none;
  }
}

[data-ui="UiTooltip"] {
  p, ul {
    &:not(:last-child) {
      margin-bottom: 0.75rem;
    }
  }

  ul {
    padding-left: 1.5rem;
    padding-right: 0.5rem;
    list-style-type: disc;
  }

  li {
    margin-bottom: 0.25rem;
    list-style-type: disc;
  }

  code {
    padding: 0.125rem 0.25rem;
    border-radius: 0.375rem;
    background-color: var(--ui-bg-accented);
  }
}
</style>
