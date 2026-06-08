<script lang="ts" setup>
const denseTriggers = Array.from({ length: 40 }, (_, i) => i)

const ROWS = 14
const COLS = 30
function buildHeatmap(): number[][] {
  let s = 11
  const rng = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => Math.round(rng() * 100)))
}
const heatmap = buildHeatmap()
const rowLabels = Array.from({ length: ROWS }, (_, i) => `R${i + 1}`)

function resolveCell(c: { row: number, col: number, value: number }) {
  const level
    = c.value > 75
      ? 'error' as const
      : c.value > 50
        ? 'warning' as const
        : c.value > 25
          ? 'success' as const
          : 'neutral' as const
  return {
    level,
    title: `R${c.row + 1} · C${c.col + 1}`,
    details: [
      { label: 'requests', value: c.value.toLocaleString() },
      { label: 'p95 latency', value: `${(40 + c.value * 1.3).toFixed(0)}ms` },
      { label: 'errors', value: c.value > 75 ? `${Math.floor(c.value / 20)}` : '0', color: c.value > 75 ? 'error' as const : 'muted' as const },
    ],
  }
}

function valueRamp(v: number) {
  if (v > 75)
    return 4
  if (v > 50)
    return 3
  if (v > 25)
    return 2
  if (v > 0)
    return 1
  return 0
}

const htmlBody = '<p>Supports <code>raw HTML</code> with <strong>bold</strong> and bullets:</p><ul><li>One</li><li>Two</li><li>Three</li></ul>'
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Components"
      title="Tooltip"
      description="Reka-ui tooltip primitives + delegated single-tooltip pattern for dense grids."
    />

    <KitSection title="Basic">
      <div class="flex flex-wrap items-center gap-4 border border-default rounded-md p-6">
        <UiTooltip text="Plain text tooltip">
          <UiButton size="sm" purpose="secondary">
            Hover (text)
          </UiButton>
        </UiTooltip>
        <UiTooltip title="Bold title" description="Followed by a muted description line.">
          <UiButton size="sm" purpose="secondary">
            Title + description
          </UiButton>
        </UiTooltip>
        <UiTooltip :html="htmlBody" size="lg">
          <UiButton size="sm" purpose="secondary">
            Rich HTML body
          </UiButton>
        </UiTooltip>
        <UiTooltip label="What is this?" title="Glossary entry" description="Inline label with a (?) trigger." />
      </div>
    </KitSection>

    <KitSection title="Sides">
      <div class="grid grid-cols-4 gap-4 border border-default rounded-md p-10">
        <UiTooltip side="top" text="Top">
          <UiButton block size="sm" purpose="secondary">
            Top
          </UiButton>
        </UiTooltip>
        <UiTooltip side="bottom" text="Bottom">
          <UiButton block size="sm" purpose="secondary">
            Bottom
          </UiButton>
        </UiTooltip>
        <UiTooltip side="left" text="Left">
          <UiButton block size="sm" purpose="secondary">
            Left
          </UiButton>
        </UiTooltip>
        <UiTooltip side="right" text="Right">
          <UiButton block size="sm" purpose="secondary">
            Right
          </UiButton>
        </UiTooltip>
      </div>
    </KitSection>

    <KitSection
      title="Dense row · 40 adjacent UiTooltip instances"
      description="Drag the cursor across the row left-to-right. With reka's TooltipProvider coordination (skipDelayDuration) every tooltip should swap instantly with no flicker."
    >
      <div class="border border-default rounded-md p-6">
        <div class="flex gap-0.5">
          <UiTooltip
            v-for="i in denseTriggers"
            :key="i"
            :title="`Cell ${i}`"
            :description="`Value: ${i * 3}`"
            side="top"
            size="xs"
          >
            <div
              class="size-6 rounded-sm cursor-default"
              :style="{ background: `color-mix(in srgb, var(--ui-text) ${(i / denseTriggers.length) * 80 + 10}%, transparent)` }"
              tabindex="0"
            />
          </UiTooltip>
        </div>
      </div>
    </KitSection>

    <KitSection
      title="Delegated grid · UiTooltipGrid with 420 cells"
      description="One floating tooltip + pointer delegation. Sweep over cells — no per-cell mount overhead. Tab focuses cells and shows tooltips via keyboard too; Escape dismisses."
    >
      <div class="border border-default rounded-md p-6">
        <UiTooltipGrid :resolve="resolveCell">
          <div
            class="grid gap-0.5"
            :style="{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }"
          >
            <template v-for="(row, rIdx) in heatmap" :key="`r-${rIdx}`">
              <div
                v-for="(v, cIdx) in row"
                :key="`${rIdx}-${cIdx}`"
                class="aspect-square rounded-sm cursor-default"
                :data-tooltip-row="rIdx"
                :data-tooltip-col="cIdx"
                :data-tooltip-value="v"
                tabindex="0"
                role="presentation"
                :style="{ background: `color-mix(in srgb, var(--ui-text) ${[5, 18, 36, 60, 88][valueRamp(v)]}%, transparent)` }"
                :aria-label="`Row ${rowLabels[rIdx]}, column ${cIdx + 1}: ${v}`"
              />
            </template>
          </div>
        </UiTooltipGrid>
      </div>
    </KitSection>

    <KitSection title="Behaviour modifiers">
      <div class="flex flex-wrap items-center gap-4 border border-default rounded-md p-6">
        <UiTooltip text="Should not appear" disabled>
          <UiButton size="sm" purpose="secondary">
            :disabled
          </UiButton>
        </UiTooltip>
        <UiTooltip text="Open delay 500ms" :delay-duration="500">
          <UiButton size="sm" purpose="secondary">
            500ms delay
          </UiButton>
        </UiTooltip>
        <UiTooltip text="Hover content allowed" :disable-hoverable-content="false" size="md">
          <UiButton size="sm" purpose="secondary">
            Hoverable body
          </UiButton>
        </UiTooltip>
      </div>
    </KitSection>
  </div>
</template>
