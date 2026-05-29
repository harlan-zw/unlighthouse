<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { UiIcon } from '../../shared/ui-icons'
import { useMouseInElement } from '@vueuse/core'
import { m, useReducedMotion } from 'motion-v'
import { computed, ref, useSlots, useTemplateRef } from 'vue'
import { liftPresets } from '../../shared/motion'
import { resolveUiIcon } from '../../shared/ui-icons'

/**
 * UiButton — the single button primitive. UButton + motion-v lift/press
 * + cursor-tracked surface FX, driven by a semantic `purpose` prop.
 *
 * `purpose` is the only styling knob — there is no raw `color`/`variant`.
 * Each purpose resolves to a fixed UButton color+variant so button intent is
 * consistent everywhere:
 *   - `cta`       primary commit / page action — inverted neutral solid.
 *   - `secondary` alternative action — neutral outline.
 *   - `quiet`     low-emphasis: alerts, inline, icon-only, back/nav — neutral ghost.
 *   - `danger`    destructive — error soft (error ghost when icon-only).
 *
 * Still forwarded: `size`, `block`, `loading`, `disabled`, `to`, `type`,
 * `icon`/`trailing-icon`, `class`, all slots. `intensity` may be set
 * explicitly to override the per-purpose motion default.
 *
 * Effect layers (FX-only intensities, all hover-gated, reduced-motion-aware):
 *   1. Wrapper lift — motion-v spring scale + y on hover, settle on tap.
 *   2. Halo — the shared `--elevation-hover` token, accent-tinted via `--fx-accent`.
 *   3. Spotlight — radial gradient anchored to cursor (`--mb-mx/--mb-my`).
 *   4. Specular sweep — thin skewed band on hover-enter for CTA only.
 *   5. Trailing-icon nudge — +1.5px on hover when `#trailing` is set.
 *
 * Modern CSS leveraged: `@property`, `color-mix(in oklab, ...)`, `mask-image`.
 */

defineOptions({ inheritAttrs: false })

const {
  purpose = 'secondary',
  intensity: intensityProp,
  block = false,
  size,
  loading = false,
  disabled = false,
  icon,
  leadingIcon,
  trailingIcon,
  ...buttonProps
} = defineProps<MotionButtonProps>()
type Purpose = 'cta' | 'secondary' | 'quiet' | 'danger'
type Intensity = 'subtle' | 'default' | 'cta'

interface MotionExtras {
  purpose?: Purpose
  intensity?: Intensity
  // Curated semantic icon names (raw `i-*` strings still accepted).
  icon?: UiIcon
  leadingIcon?: UiIcon
  trailingIcon?: UiIcon
}

// UButton props minus the styling knobs purpose now owns and the icon props
// MotionExtras re-types to the curated `UiIcon` union.
type MotionButtonProps = Omit<ButtonProps, 'color' | 'variant' | 'icon' | 'leadingIcon' | 'trailingIcon'> & MotionExtras

// Resolve semantic icon names to iconify ids before they reach UButton.
const resolvedIcon = computed(() => resolveUiIcon(icon))
const resolvedLeadingIcon = computed(() => resolveUiIcon(leadingIcon))
const resolvedTrailingIcon = computed(() => resolveUiIcon(trailingIcon))

const slots = useSlots()

// Icon-only when there is no label content (no default slot, no `label` prop).
const isIconOnly = computed(() => !slots.default && !('label' in buttonProps))

// purpose → resolved UButton color + variant.
const resolved = computed<{ color: ButtonProps['color'], variant: ButtonProps['variant'] }>(() => {
  switch (purpose) {
    case 'cta':
      return { color: 'neutral', variant: 'solid' }
    case 'quiet':
      return { color: 'neutral', variant: 'ghost' }
    case 'danger':
      return { color: 'error', variant: isIconOnly.value ? 'ghost' : 'soft' }
    case 'secondary':
    default:
      return { color: 'neutral', variant: 'outline' }
  }
})
const color = computed(() => resolved.value.color)
const variant = computed(() => resolved.value.variant)

// Per-purpose motion default; `intensity` prop overrides.
//   cta at lg/xl → full CTA FX; smaller cta → default. quiet → subtle (no FX).
const intensity = computed<Intensity>(() => {
  if (intensityProp)
    return intensityProp
  if (purpose === 'cta')
    return (size === 'xl' || size === 'lg' || !size) ? 'cta' : 'default'
  if (purpose === 'quiet' || size === 'xs')
    return 'subtle'
  return 'default'
})

const reduced = useReducedMotion()
const wrapperEl = useTemplateRef<HTMLElement>('wrapperEl')
const hovered = ref(false)

const isDisabled = computed(() => disabled || loading)
const showFx = computed(() => intensity.value !== 'subtle' && !isDisabled.value)

// Only attach the mouse tracker when FX render — saves ~100 listeners on
// dashboards full of subtle/icon buttons.
const trackerTarget = computed(() => (showFx.value ? wrapperEl.value : null))
const { elementX, elementY, elementWidth, elementHeight, isOutside }
  = useMouseInElement(trackerTarget)

const mxPct = computed(() => {
  if (!showFx.value || isOutside.value || !elementWidth.value)
    return 50
  return Math.max(0, Math.min(100, (elementX.value / elementWidth.value) * 100))
})
const myPct = computed(() => {
  if (!showFx.value || isOutside.value || !elementHeight.value)
    return 50
  return Math.max(0, Math.min(100, (elementY.value / elementHeight.value) * 100))
})

const lift = computed(() => {
  if (reduced.value)
    return { hover: {}, tap: {}, transition: {} }
  return liftPresets[intensity.value]
})

const wrapperStyle = computed(() => {
  if (!showFx.value)
    return undefined
  return {
    '--mb-mx': `${mxPct.value}%`,
    '--mb-my': `${myPct.value}%`,
    '--fx-accent': 'var(--ui-text)',
  }
})

const wrapperClass = computed(() => block ? 'flex w-full' : 'inline-flex max-w-full')
const hasTrailing = computed(() => !!slots.trailing)
</script>

<template>
  <m.div
    ref="wrapperEl"
    class="ui-motion-button group/mbtn relative isolate"
    :class="[wrapperClass]"
    :while-hover="isDisabled ? undefined : lift.hover"
    :while-press="isDisabled ? undefined : lift.tap"
    :transition="lift.transition"
    :data-intensity="intensity"
    :data-color="color"
    :style="wrapperStyle"
    @hover-start="hovered = !isDisabled"
    @hover-end="hovered = false"
  >
    <!-- Halo — ambient lift via box-shadow rings, follows button shape. -->
    <span
      v-if="showFx"
      class="ui-motion-button__halo pointer-events-none absolute"
      aria-hidden="true"
    />

    <!-- Clipper bounds FX overlays to the button shape. Skip overflow:hidden
         when no FX render so the button's native border-radius isn't cropped. -->
    <div
      class="ui-motion-button__clip relative w-full"
      :class="[block ? 'flex' : 'inline-flex', { 'ui-motion-button__clip--active': showFx }]"
    >
      <UButton
        v-bind="{ ...buttonProps, ...$attrs } as ButtonProps"
        :color="color"
        :size="size"
        :variant="variant"
        :loading="loading"
        :disabled="disabled"
        :block="block"
        :icon="resolvedIcon"
        :leading-icon="resolvedLeadingIcon"
        :trailing-icon="resolvedTrailingIcon"
        class="ui-motion-button__btn relative z-10"
      >
        <!-- Forward every UButton slot. Trailing gets a hover-nudge wrapper. -->
        <template v-for="(_, name) in ($slots as Record<string, unknown>)" :key="name" #[name]="slotData">
          <slot v-if="name !== 'trailing'" :name="name" v-bind="slotData || {}" />
        </template>

        <template v-if="hasTrailing" #trailing="slotData">
          <m.span
            class="inline-flex"
            :animate="{ x: hovered && !reduced ? 1.5 : 0 }"
            :transition="{ duration: 0.22, ease: 'easeOut' }"
          >
            <slot name="trailing" v-bind="slotData || {}" />
          </m.span>
        </template>
      </UButton>

      <span
        v-if="showFx"
        class="ui-motion-button__spot pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <span
        v-if="showFx && intensity === 'cta'"
        class="ui-motion-button__shimmer pointer-events-none absolute inset-y-0"
        aria-hidden="true"
      />
    </div>
  </m.div>
</template>

<style scoped>
@property --mb-mx {
  syntax: '<percentage>';
  inherits: true;
  initial-value: 50%;
}
@property --mb-my {
  syntax: '<percentage>';
  inherits: true;
  initial-value: 50%;
}

/* Match UButton's native rounded-md (0.375rem) so the clip doesn't crop. */
.ui-motion-button {
  border-radius: 0.375rem;
}
.ui-motion-button[data-intensity="cta"] {
  border-radius: 0.5rem;
}

.ui-motion-button__clip--active {
  overflow: hidden;
  border-radius: inherit;
}

/* ── Halo ── hover-tier elevation: the shared --elevation-hover token, an
   accent-tinted ambient lift. --fx-accent (set on the wrapper) tints it;
   the cta intensity scales it up locally. */
.ui-motion-button__halo {
  z-index: 0;
  inset: 0;
  opacity: 0;
  border-radius: inherit;
  background: transparent;
  box-shadow: var(--elevation-hover);
  transition: opacity 360ms cubic-bezier(0.22, 1, 0.36, 1);
}
.ui-motion-button[data-intensity="cta"] .ui-motion-button__halo {
  box-shadow:
    0 3px 12px -3px color-mix(in oklab, var(--fx-accent) 16%, transparent),
    0 12px 28px -10px color-mix(in oklab, var(--fx-accent) 12%, transparent);
}
.ui-motion-button:hover .ui-motion-button__halo {
  opacity: 1;
}

/* ── Spotlight — cursor-tracked neutral highlight. */
.ui-motion-button__spot {
  z-index: 20;
  opacity: 0;
  border-radius: inherit;
  background: radial-gradient(
    circle 60px at var(--mb-mx, 50%) var(--mb-my, 50%),
    color-mix(in oklab, var(--fx-accent) 10%, transparent),
    transparent 70%
  );
  transition: opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
  -webkit-mask-image: radial-gradient(ellipse at center, rgb(0 0 0) 60%, rgb(0 0 0 / 0.5) 90%, rgb(0 0 0 / 0) 100%);
  mask-image: radial-gradient(ellipse at center, rgb(0 0 0) 60%, rgb(0 0 0 / 0.5) 90%, rgb(0 0 0 / 0) 100%);
}
.ui-motion-button[data-intensity="cta"] .ui-motion-button__spot {
  background: radial-gradient(
    circle 80px at var(--mb-mx, 50%) var(--mb-my, 50%),
    color-mix(in oklab, var(--fx-accent) 14%, transparent),
    transparent 70%
  );
}
.ui-motion-button:hover .ui-motion-button__spot {
  opacity: 1;
}

/* ── Specular sweep — CTA only, one pass per hover-enter. */
.ui-motion-button__shimmer {
  z-index: 25;
  width: 22%;
  left: 0;
  transform: translateX(-220%) skewX(-22deg);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in oklab, var(--fx-accent) 18%, transparent) 50%,
    transparent
  );
  opacity: 0;
  filter: blur(3px);
}
.ui-motion-button[data-intensity="cta"]:hover .ui-motion-button__shimmer {
  opacity: 1;
  animation: ui-mbtn-sweep 1.4s linear(0, 0.05 8%, 0.2 18%, 0.55 40%, 0.85 65%, 0.96 80%, 1) both;
}
@keyframes ui-mbtn-sweep {
  0% { transform: translateX(-220%) skewX(-22deg); }
  100% { transform: translateX(400%) skewX(-22deg); }
}

@media (prefers-reduced-motion: reduce) {
  .ui-motion-button { transform: none; transition: none; }
  .ui-motion-button__spot,
  .ui-motion-button__shimmer,
  .ui-motion-button__halo { display: none; }
}

@media (hover: none) {
  .ui-motion-button__spot,
  .ui-motion-button__shimmer { display: none; }
}
</style>
