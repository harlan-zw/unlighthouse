<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { UiIcon } from '../../shared/ui-icons'
import type { SlotTextOptions } from '../../utils/slot-text'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { useMouseInElement } from '@vueuse/core'
import { m, useReducedMotion } from 'motion-v'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, useSlots, useTemplateRef, watch } from 'vue'
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
 *   - `link`      tertiary action below a cta/secondary — neutral link, no chrome,
 *                 no FX/lift (the "see other plans" / "or paste a list" tier).
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
  animatedLabel = false,
  ...buttonProps
} = defineProps<MotionButtonProps>()
type Purpose = 'cta' | 'secondary' | 'quiet' | 'danger' | 'link'
type Intensity = 'subtle' | 'default' | 'cta'

interface MotionExtras {
  purpose?: Purpose
  intensity?: Intensity
  // Curated semantic icon names (raw `i-*` strings still accepted).
  icon?: UiIcon
  leadingIcon?: UiIcon
  trailingIcon?: UiIcon
  animatedLabel?: boolean | SlotTextOptions
}

// UButton props minus the styling knobs purpose now owns and the icon props
// MotionExtras re-types to the curated `UiIcon` union.
type MotionButtonProps = Omit<ButtonProps, 'color' | 'variant' | 'icon' | 'leadingIcon' | 'trailingIcon'> & MotionExtras

const slots = useSlots()

// Icon-only when there is no label content (no default slot, no `label` prop).
const isIconOnly = computed(() => !slots.default && !('label' in buttonProps))

// Dev-time guard: an icon-only button with no accessible name ships silently as
// an unlabelled control. Warn so the caller passes `aria-label` (or `title`).
if (import.meta.dev) {
  const attrs = useAttrs()
  onMounted(() => {
    if (isIconOnly.value && !attrs['aria-label'] && !attrs['aria-labelledby'] && !attrs.title) {
      logOperationalWarn('ui.button_icon_accessible_name_missing', null, {
        icon,
        leadingIcon,
        trailingIcon,
      }, console)
    }
  })
}

// purpose → resolved UButton color + variant.
const resolved = computed<{ color: ButtonProps['color'], variant: ButtonProps['variant'] }>(() => {
  switch (purpose) {
    case 'cta':
      return { color: 'neutral', variant: 'solid' }
    case 'quiet':
      return { color: 'neutral', variant: 'ghost' }
    case 'link':
      return { color: 'neutral', variant: 'link' }
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
  if (purpose === 'quiet' || purpose === 'link' || size === 'xs')
    return 'subtle'
  return 'default'
})

const reduced = useReducedMotion()
const wrapperEl = useTemplateRef<HTMLElement>('wrapperEl')
const clipEl = useTemplateRef<HTMLElement>('clipEl')
const hovered = ref(false)
const measuredWidth = ref<number | null>(null)
let resizeObserver: ResizeObserver | undefined

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
  // Link is a text affordance, not a surface — never lift/scale on hover.
  if (reduced.value || purpose === 'link')
    return { hover: {}, tap: {}, transition: {} }
  const preset = liftPresets[intensity.value]
  // A full-width button scaling horizontally overflows its container and gets
  // clipped by any `overflow:hidden` ancestor. Keep the vertical lift, drop the
  // scale so block buttons stay within bounds.
  if (block) {
    return {
      hover: { y: preset.hover.y },
      tap: { y: preset.tap.y },
      transition: preset.transition,
    }
  }
  return preset
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

// `w-fit` keeps the wrapper hugging its content even when it's a flex/grid item
// (an inline-flex box blockifies to flex and would otherwise stretch to the
// column's full width, dragging the halo/spot FX overlays out with it).
const wrapperClass = computed(() => block ? 'flex w-full' : 'inline-flex w-fit max-w-full')
const clipMotion = computed(() => {
  if (block || measuredWidth.value == null)
    return undefined
  return { width: measuredWidth.value }
})
const leadingIconName = computed(() => loading ? 'loading' : (leadingIcon || icon))
const trailingIconName = computed(() => resolveUiIcon(trailingIcon))
const hasLeading = computed(() => !!slots.leading || !!leadingIconName.value)
const hasTrailing = computed(() => !!slots.trailing)
const buttonLabel = computed(() => typeof buttonProps.label === 'string' ? buttonProps.label : undefined)
const shouldAutoAnimateLabel = computed(() => {
  if (!buttonLabel.value || slots.default || block || animatedLabel === false)
    return false
  return buttonLabel.value.length <= 24
})
const animatedLabelOptions = computed(() => {
  if (!shouldAutoAnimateLabel.value)
    return null

  return typeof animatedLabel === 'object' ? animatedLabel : {}
})
const hasAnimatedLabel = computed(() => !!animatedLabelOptions.value && !!buttonLabel.value)
const resolvedButtonProps = computed(() => {
  if (!hasAnimatedLabel.value)
    return buttonProps
  const { label: _label, ...rest } = buttonProps
  return rest
})
const hitTargetClass = 'min-h-11 min-w-11 lg:min-h-0 lg:min-w-0'

function buttonEl() {
  return domNode(clipEl.value)?.querySelector<HTMLElement>('.ui-motion-button__btn') ?? null
}

function domNode(value: unknown): HTMLElement | null {
  if (Array.isArray(value))
    return domNode(value[0])

  if (value && typeof (value as HTMLElement).querySelector === 'function')
    return value as HTMLElement

  const el = (value as { $el?: unknown } | null)?.$el
  if (el && typeof (el as HTMLElement).querySelector === 'function')
    return el as HTMLElement

  return null
}

function syncButtonWidth() {
  if (block)
    return
  const el = buttonEl()
  if (!el)
    return
  measuredWidth.value = Math.ceil(el.scrollWidth || el.getBoundingClientRect().width)
}

onMounted(() => {
  void nextTick(() => {
    syncButtonWidth()

    const el = buttonEl()
    if (!el || typeof ResizeObserver === 'undefined')
      return
    resizeObserver = new ResizeObserver(() => syncButtonWidth())
    resizeObserver.observe(el)
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch(
  () => [buttonLabel.value, loading, icon, leadingIcon, trailingIcon],
  async () => {
    await nextTick()
    syncButtonWidth()
  },
)
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
    <m.div
      class="ui-motion-button__clip-shell"
      :class="block ? 'flex w-full' : 'inline-flex'"
      :animate="clipMotion"
      :transition="reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.62 }"
    >
      <div
        ref="clipEl"
        class="ui-motion-button__clip relative"
        :class="[block ? 'flex w-full' : 'inline-flex w-max max-w-none whitespace-nowrap', { 'ui-motion-button__clip--active': showFx }]"
      >
        <UButton
          v-bind="{ ...resolvedButtonProps, ...$attrs } as ButtonProps"
          :color="color"
          :size="size"
          :variant="variant"
          :loading="false"
          :disabled="isDisabled"
          :block="block"
          :icon="undefined"
          :leading-icon="undefined"
          :trailing-icon="trailingIconName"
          class="ui-motion-button__btn relative z-10 whitespace-nowrap"
          :class="[hitTargetClass, { 'hover:underline underline-offset-2': purpose === 'link' }]"
        >
          <template v-if="hasLeading" #leading="slotData">
            <slot v-if="slots.leading" name="leading" v-bind="slotData || {}" />
            <m.span
              v-else-if="leadingIconName"
              :key="leadingIconName"
              class="ui-motion-button__leading inline-flex shrink-0"
              :initial="reduced ? false : { opacity: 0, x: -6, scale: 0.82 }"
              :animate="{ opacity: 1, x: 0, scale: 1 }"
              :transition="reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 30, mass: 0.55 }"
            >
              <UiIcon
                :name="leadingIconName"
                class="size-4"
                :class="{ 'animate-spin': loading }"
                aria-hidden="true"
              />
            </m.span>
          </template>

          <template v-if="hasAnimatedLabel && buttonLabel && animatedLabelOptions" #default>
            <UiSlotText :text="buttonLabel" :options="animatedLabelOptions" />
          </template>

          <!-- Forward every UButton slot. Trailing gets a hover-nudge wrapper. -->
          <template v-for="(_, name) in ($slots as Record<string, unknown>)" :key="name" #[name]="slotData">
            <slot v-if="name !== 'leading' && name !== 'trailing'" :name="name" v-bind="slotData || {}" />
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

.ui-motion-button__clip-shell,
.ui-motion-button__clip--active {
  overflow: hidden;
}

.ui-motion-button__clip--active {
  border-radius: inherit;
}

@media (prefers-reduced-motion: reduce) {
  .ui-motion-button__clip-shell {
    transition: none;
  }
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
