<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import { useMouseInElement } from '@vueuse/core'
import { m, useReducedMotion } from 'motion-v'

/**
 * UiMotionButton — UButton + motion-v lift/press + cursor-tracked surface FX.
 *
 * Drop-in replacement for `<UButton>`. All UButton props/slots forwarded.
 * Extra props:
 *   - `intensity`: 'subtle' | 'default' | 'cta' (auto-inferred from
 *      size+variant if omitted).
 *
 * Effect layers (FX-only intensities, all hover-gated, reduced-motion-aware):
 *   1. Wrapper lift — motion-v spring scale + y on hover, settle on tap.
 *   2. Halo — soft box-shadow rings via `--ui-text` accent, follows shape.
 *   3. Spotlight — radial gradient anchored to cursor (`--mb-mx/--mb-my`),
 *      neutral tint so primary/pro buttons don't read violet.
 *   4. Specular sweep — thin skewed band on hover-enter for CTA only.
 *   5. Trailing-icon nudge — +1.5px on hover when `#trailing` is set.
 *
 * Modern CSS leveraged: `@property`, `color-mix(in oklab, ...)`, `mask-image`.
 */

defineOptions({ inheritAttrs: false })

const {
  intensity: intensityProp,
  block = false,
  size,
  variant,
  color = 'neutral',
  loading = false,
  disabled = false,
  ...buttonProps
} = defineProps<ButtonProps & MotionExtras>()

type Intensity = 'subtle' | 'default' | 'cta'

interface MotionExtras {
  intensity?: Intensity
}

// Auto-infer intensity from size + variant if not explicitly set.
//   xl/lg + solid → cta
//   xs / ghost / link → subtle
//   else → default
const intensity = computed<Intensity>(() => {
  if (intensityProp)
    return intensityProp
  if ((size === 'xl' || size === 'lg') && (!variant || variant === 'solid'))
    return 'cta'
  if (size === 'xs' || variant === 'ghost' || variant === 'link')
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
  const map = {
    subtle: {
      hover: { scale: 1.015, y: -1 },
      tap: { scale: 0.985, y: 0 },
      transition: { type: 'spring', stiffness: 380, damping: 22, mass: 0.6 },
    },
    default: {
      hover: { scale: 1.02, y: -1.5 },
      tap: { scale: 0.975, y: 0 },
      transition: { type: 'spring', stiffness: 360, damping: 20, mass: 0.7 },
    },
    cta: {
      hover: { scale: 1.025, y: -2 },
      tap: { scale: 0.97, y: 0 },
      transition: { type: 'spring', stiffness: 340, damping: 18, mass: 0.8 },
    },
  } as const
  return map[intensity.value]
})

const wrapperStyle = computed(() => {
  if (!showFx.value)
    return undefined
  return {
    '--mb-mx': `${mxPct.value}%`,
    '--mb-my': `${myPct.value}%`,
    '--mb-accent': 'var(--ui-text)',
  }
})

const wrapperClass = computed(() => block ? 'flex w-full' : 'inline-flex max-w-full')
const slots = useSlots()
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

/* ── Halo ── uniform ambient lift via box-shadow rings. */
.ui-motion-button__halo {
  z-index: 0;
  inset: 0;
  opacity: 0;
  border-radius: inherit;
  background: transparent;
  box-shadow:
    0 2px 8px -2px color-mix(in oklab, var(--mb-accent) 10%, transparent),
    0 8px 20px -8px color-mix(in oklab, var(--mb-accent) 8%, transparent);
  transition: opacity 360ms cubic-bezier(0.22, 1, 0.36, 1);
}
.ui-motion-button[data-intensity="cta"] .ui-motion-button__halo {
  box-shadow:
    0 3px 12px -3px color-mix(in oklab, var(--mb-accent) 16%, transparent),
    0 12px 28px -10px color-mix(in oklab, var(--mb-accent) 12%, transparent);
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
    color-mix(in oklab, var(--mb-accent) 10%, transparent),
    transparent 70%
  );
  transition: opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
  -webkit-mask-image: radial-gradient(ellipse at center, rgb(0 0 0) 60%, rgb(0 0 0 / 0.5) 90%, rgb(0 0 0 / 0) 100%);
  mask-image: radial-gradient(ellipse at center, rgb(0 0 0) 60%, rgb(0 0 0 / 0.5) 90%, rgb(0 0 0 / 0) 100%);
}
.ui-motion-button[data-intensity="cta"] .ui-motion-button__spot {
  background: radial-gradient(
    circle 80px at var(--mb-mx, 50%) var(--mb-my, 50%),
    color-mix(in oklab, var(--mb-accent) 14%, transparent),
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
    color-mix(in oklab, var(--mb-accent) 18%, transparent) 50%,
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
