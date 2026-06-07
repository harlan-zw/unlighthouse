/**
 * Motion presets — the JS half of the design system's motion vocabulary,
 * driven by motion-v (`<m.*>` elements). The CSS half is the `--ease-*`
 * easings + route keyframes in global.css.
 *
 *   - springs         named spring transitions, reused everywhere
 *   - liftPresets     hover / press transforms (counterpart of --elevation-hover)
 *   - entrancePresets mount reveals — fade / fadeUp / pop
 *   - stagger*        list-reveal orchestration
 *
 * Every consumer gates motion behind `useReducedMotion()` — see `entranceProps()`
 * and the `UiButton` `lift` computed for the pattern.
 *
 * SSR note: a motion-v entrance renders its `initial` (hidden) state on the
 * server and animates to `animate` on client mount. Content is therefore
 * briefly hidden until hydration; acceptable for app surfaces, and reduced
 * motion skips the hide entirely.
 */

/* ─── Springs ─────────────────────────────────────────────────────────────
   Named motion-v `transition` configs. Reuse rather than hand-tuning. */
export const springs = {
  /** Quick, minimal overshoot — toggles, small reveals. */
  snappy: { type: 'spring', stiffness: 380, damping: 26, mass: 0.6 },
  /** Balanced, unhurried — the default for entrances and content shifts. */
  smooth: { type: 'spring', stiffness: 210, damping: 26, mass: 0.9 },
  /** Soft, slow settle — large surfaces, drawers. */
  gentle: { type: 'spring', stiffness: 180, damping: 24, mass: 1 },
} as const

/* ─── Lift ────────────────────────────────────────────────────────────────
   Hover / press transforms. The CSS counterpart is `--elevation-hover`; this
   is the JS half. Shared so buttons, cards, and links lift with one feel. */
export type LiftIntensity = 'subtle' | 'default' | 'cta'

export interface LiftPreset {
  hover: { scale: number, y: number }
  tap: { scale: number, y: number }
  transition: { type: 'spring', stiffness: number, damping: number, mass: number }
}

export const liftPresets: Record<LiftIntensity, LiftPreset> = {
  /** Barely-there nudge — crisp, quick, no overshoot (high damping). */
  subtle: {
    hover: { scale: 1.012, y: -1 },
    tap: { scale: 0.99, y: 0 },
    transition: { type: 'spring', stiffness: 420, damping: 30, mass: 0.5 },
  },
  /** Clear lift with a touch of spring — the standard. */
  default: {
    hover: { scale: 1.03, y: -3 },
    tap: { scale: 0.97, y: 0 },
    transition: { type: 'spring', stiffness: 320, damping: 21, mass: 0.8 },
  },
  /** Bold, bouncy lift — visible overshoot (low damping), slow settle. */
  cta: {
    hover: { scale: 1.055, y: -5 },
    tap: { scale: 0.95, y: 0 },
    transition: { type: 'spring', stiffness: 240, damping: 13, mass: 1.1 },
  },
}

/* ─── Entrance ────────────────────────────────────────────────────────────
   Mount reveals for `<m.*>` elements. Bind with `entranceProps()` so reduced
   motion is handled:  <m.div v-bind="entranceProps(entrancePresets.fadeUp, reduced)"> */
export type EntranceName = 'fade' | 'fadeUp' | 'pop'

export interface EntrancePreset {
  initial: Record<string, number>
  enter: Record<string, number>
  transition: Record<string, unknown>
}

export const entrancePresets: Record<EntranceName, EntrancePreset> = {
  fade: {
    initial: { opacity: 0 },
    enter: { opacity: 1 },
    transition: { duration: 0.45, ease: 'easeOut' },
  },
  fadeUp: {
    initial: { opacity: 0, y: 12 },
    enter: { opacity: 1, y: 0 },
    // A long, mildly-eased tween — not a spring and not an aggressive easeOut;
    // both front-load the change and read as rushed. A gentle easeOut over
    // 600ms spreads the motion so the entrance is graceful and watchable.
    transition: { duration: 0.6, ease: 'easeOut' },
  },
  pop: {
    initial: { opacity: 0, scale: 0.94 },
    enter: { opacity: 1, scale: 1 },
    transition: springs.smooth,
  },
}

/**
 * v-bind helper — returns motion-v `{ initial, animate, transition }`, or `{}`
 *  when reduced motion is on (the element then mounts in its resting state).
 */
export function entranceProps(preset: EntrancePreset, reduced?: boolean) {
  if (reduced)
    return {}
  return { initial: preset.initial, animate: preset.enter, transition: preset.transition }
}

/* ─── Stagger ─────────────────────────────────────────────────────────────
   List-reveal orchestration. The parent `<m.*>` binds `staggerContainer`, each
   child `<m.*>` binds `staggerChild`; children animate in sequence. */
export const staggerContainer = {
  initial: 'initial',
  animate: 'animate',
  variants: { animate: { transition: { staggerChildren: 0.05 } } },
} as const

export const staggerChild = {
  variants: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0, transition: springs.smooth },
  },
} as const
