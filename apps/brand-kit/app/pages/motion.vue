<script lang="ts" setup>
import { m, useReducedMotion } from 'motion-v'
import {
  entrancePresets,
  entranceProps,
  liftPresets,
  springs,
  staggerChild,
  staggerContainer,
} from '#design-system/shared/motion'

const reduced = useReducedMotion()

const lifts = [
  { name: 'subtle', use: 'Icon buttons, quiet actions, dense rows.' },
  { name: 'default', use: 'Standard buttons, interactive cards.' },
  { name: 'cta', use: 'Primary commit actions — the biggest lift.' },
] as const

const entrances = [
  { name: 'fade', use: 'Quietest — inline state swaps.' },
  { name: 'fadeUp', use: 'Default surface entrance — fade + short rise.' },
  { name: 'pop', use: 'Scale-in — notifications, things that demand a glance.' },
] as const

const springNames = [
  { name: 'snappy', use: 'Quick, minimal overshoot.' },
  { name: 'smooth', use: 'Balanced — the default.' },
  { name: 'gentle', use: 'Soft, slow settle.' },
] as const

// Replay — bumping the key re-mounts the demo nodes so entrances re-trigger.
const replayKey = ref(0)
function replay() {
  replayKey.value++
}

const staggerItems = ['Indexed pages', 'Top queries', 'Core Web Vitals', 'Backlinks', 'Competitors']
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Foundation"
      title="Motion"
      description="The motion-v vocabulary in layers/design-system/shared/motion.ts. Lift presets for hover/press, entrance presets for mounts, named springs, and list stagger — every preset is reduced-motion aware."
    />

    <KitSection
      title="Lift — hover & press"
      code="liftPresets"
      description="Spring transforms for interactive surfaces. Hover and press each tile. The CSS counterpart is the --elevation-hover token; buttons ride the same presets."
    >
      <div class="grid gap-4 sm:grid-cols-3">
        <m.div
          v-for="l in lifts"
          :key="l.name"
          class="lift-tile cursor-pointer rounded-xl bg-default p-5"
          :while-hover="reduced ? undefined : liftPresets[l.name].hover"
          :while-press="reduced ? undefined : liftPresets[l.name].tap"
          :transition="liftPresets[l.name].transition"
        >
          <code class="font-mono text-[11px] text-primary-500">{{ l.name }}</code>
          <p class="mt-1 text-sm text-muted">
            {{ l.use }}
          </p>
        </m.div>
      </div>
    </KitSection>

    <KitSection
      title="Entrance"
      code="entrancePresets"
      description="Mount reveals for content that appears. UiAlert and EmptyState use fadeUp. Hit Replay to re-mount and watch them animate in."
    >
      <div class="space-y-4">
        <UiButton size="xs" purpose="secondary" icon="i-carbon-renew" @click="replay">
          Replay
        </UiButton>
        <div class="grid gap-4 sm:grid-cols-3">
          <m.div
            v-for="e in entrances"
            :key="`${e.name}-${replayKey}`"
            class="rounded-xl bg-default p-5 [box-shadow:var(--elevation-raised)]"
            v-bind="entranceProps(entrancePresets[e.name], reduced)"
          >
            <code class="font-mono text-[11px] text-primary-500">{{ e.name }}</code>
            <p class="mt-1 text-sm text-muted">
              {{ e.use }}
            </p>
          </m.div>
        </div>
      </div>
    </KitSection>

    <KitSection
      title="Springs"
      code="springs"
      description="Named spring transitions reused across presets. Press and release each tile — the difference is in how it settles."
    >
      <div class="grid gap-4 sm:grid-cols-3">
        <m.div
          v-for="s in springNames"
          :key="s.name"
          class="grid cursor-pointer place-items-center rounded-xl bg-accented p-8 text-center"
          :while-press="reduced ? undefined : { scale: 0.88 }"
          :transition="springs[s.name]"
        >
          <div class="space-y-1">
            <code class="font-mono text-[11px] text-highlighted">{{ s.name }}</code>
            <p class="text-[11px] text-dimmed">
              {{ s.use }}
            </p>
          </div>
        </m.div>
      </div>
    </KitSection>

    <KitSection
      title="Stagger"
      code="staggerContainer · staggerChild"
      description="List reveals — children animate in sequence. Hit Replay to re-run."
    >
      <div class="space-y-4">
        <UiButton size="xs" purpose="secondary" icon="i-carbon-renew" @click="replay">
          Replay
        </UiButton>
        <m.div
          :key="replayKey"
          class="space-y-2 rounded-xl bg-accented p-4"
          v-bind="reduced ? {} : staggerContainer"
        >
          <m.div
            v-for="item in staggerItems"
            :key="item"
            class="flex items-center gap-3 rounded-lg bg-default px-4 py-3 [box-shadow:var(--elevation-flat)]"
            v-bind="reduced ? {} : staggerChild"
          >
            <span class="size-1.5 rounded-full bg-primary-500" />
            <span class="text-sm text-default">{{ item }}</span>
          </m.div>
        </m.div>
      </div>
    </KitSection>

    <KitSection
      title="Reduced motion"
      description="Every preset is gated behind useReducedMotion(). When the OS requests reduced motion, lifts and entrances resolve to no-ops — content mounts in its resting state, nothing transforms."
    >
      <div class="rounded-xl border border-default bg-muted/40 p-5 text-sm text-muted">
        Current preference:
        <code class="font-mono text-xs text-highlighted">{{ reduced ? 'reduce — motion disabled' : 'no-preference — motion on' }}</code>
      </div>
    </KitSection>
  </div>
</template>

<style scoped>
/* Lift tiles pair the motion-v transform with the --elevation-hover halo —
   the same combination UiButton uses. */
.lift-tile {
  box-shadow: var(--elevation-raised);
  transition: box-shadow 240ms var(--ease-standard);
}
.lift-tile:hover {
  box-shadow: var(--elevation-raised), var(--elevation-hover);
}
</style>
