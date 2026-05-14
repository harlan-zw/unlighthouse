<script setup lang="ts">
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
 * - `disableHoverableContent: true` — the content layer cannot be hovered,
 *   eliminating the "safe-polygon" cursor traversal flicker between
 *   tightly-packed triggers.
 * - `pointer-events: none` on the content node — defence in depth so the
 *   tooltip never steals events from underlying interactive content.
 */

interface Props {
  /** Plain text body. */
  text?: string
  /** Bold title rendered above description. */
  title?: string
  /** Secondary body text. */
  description?: string
  /** Raw HTML body — only rendered when title/description/text/#text are all absent. */
  html?: string
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
}

const props = withDefaults(defineProps<Props>(), {
  side: 'top',
  align: 'center',
  sideOffset: 6,
  disableHoverableContent: true,
  disabled: false,
  size: 'md',
})

defineSlots<{
  default?: () => any
  text?: () => any
}>()

const slots = useSlots()

const hasContent = computed(() =>
  !!(props.text || props.title || props.description || props.html || slots.text),
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
        <TooltipTrigger as-child>
          <UIcon name="i-carbon-help" class="size-3 text-dimmed hover:text-muted transition-colors cursor-help" />
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            :side="side"
            :align="align"
            :side-offset="sideOffset"
            :collision-padding="8"
            class="ui-tooltip-content"
            role="tooltip"
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
      <TooltipTrigger as-child>
        <span :class="$slots.default ? 'inline-block' : 'inline-flex'">
          <slot v-if="$slots.default" />
          <UIcon v-else name="i-carbon-help" color="primary" :size="iconSize || 'md'" class="cursor-help" />
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side"
          :align="align"
          :side-offset="sideOffset"
          :collision-padding="8"
          class="ui-tooltip-content"
          role="tooltip"
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
            <div v-else-if="html" v-html="html" />
          </div>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style>
.ui-tooltip-content {
  background-color: var(--ui-bg-elevated);
  background-image: linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.025),
    rgb(0 0 0 / 0.015) 60%,
    rgb(0 0 0 / 0.03)
  );
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  pointer-events: none;
  z-index: 50;
  will-change: transform, opacity;
  transform-origin: var(--reka-tooltip-content-transform-origin, center);
  /*
   * Stacked depth, all in box-shadow (gradients are forbidden by DESIGN.pro.md):
   * - tight contact shadow
   * - soft mid shadow
   * - atmospheric long shadow
   * - 1px inset top highlight (light-from-above)
   * - 1px inset bottom hairline (settled-on-surface)
   * The two inset lines create a beveled edge without any gradient surface.
   */
  box-shadow:
    0 1px 1px 0 rgb(0 0 0 / 0.05),
    0 4px 12px -2px rgb(0 0 0 / 0.08),
    0 16px 32px -8px rgb(0 0 0 / 0.12),
    inset 0 1px 0 0 rgb(255 255 255 / 0.06),
    inset 0 -1px 0 0 rgb(0 0 0 / 0.04);
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

.dark .ui-tooltip-content {
  background-image: linear-gradient(
    to bottom,
    rgb(255 255 255 / 0.04),
    rgb(255 255 255 / 0.015) 55%,
    rgb(0 0 0 / 0.04)
  );
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
