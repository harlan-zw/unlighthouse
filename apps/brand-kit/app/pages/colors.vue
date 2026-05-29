<script setup lang="ts">
const scales = ['neutral', 'primary'] as const
const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
const semanticText = ['default', 'muted', 'dimmed', 'toned', 'highlighted', 'inverted']
const semanticBg = ['default', 'muted', 'elevated', 'accented', 'inverted']
const semanticBorder = ['default', 'muted', 'accented', 'inverted']

// ─── Neutral bleed candidates ────────────────────────────────────────────
// The live primary palette is shown by the `primary` scale above. This block
// only compares neutral violet-bleed strengths — still an open decision.
const HUE = 292
const swatch = (l: number, c: number) => `oklch(${l}% ${c} ${HUE})`

const neutralL = [98.4, 96.8, 92.9, 86.9, 70.4, 55.4, 44.6, 32, 22, 16, 11]
const neutralVariants = {
  // ~1.6x chroma — currently applied in global.css
  'Light bleed': [0.003, 0.006, 0.013, 0.022, 0.035, 0.038, 0.037, 0.033, 0.029, 0.024, 0.019],
  // ~2.4x chroma — visibly violet-grey
  'Noticeable bleed': [0.005, 0.009, 0.020, 0.033, 0.052, 0.058, 0.056, 0.050, 0.044, 0.036, 0.029],
  // hue shift only, original low chroma kept
  'Hue-align only': [0.002, 0.004, 0.008, 0.014, 0.022, 0.024, 0.023, 0.021, 0.018, 0.015, 0.012],
} as const

const APPLIED = { neutral: 'Noticeable bleed' }
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Foundation"
      title="Colors"
      description="Violet primary on a violet-tinted slate (hue 292) neutral. Pro CTAs use saturated violet; primary actions invert via bg-inverted."
    />

    <KitSection
      v-for="scale in scales"
      :key="scale"
      :title="scale"
      :code="`--ui-color-${scale}-{50..950}`"
    >
      <div class="grid grid-cols-11 gap-1">
        <div v-for="s in steps" :key="s" class="space-y-1">
          <div
            class="aspect-square rounded-md ring-1 ring-default"
            :style="{ background: `var(--ui-color-${scale}-${s})` }"
          />
          <div class="text-[10px] text-dimmed font-mono text-center">
            {{ s }}
          </div>
        </div>
      </div>
    </KitSection>

    <KitSection
      title="Neutral — violet bleed candidates"
      code="hue 292 · chroma lift over stock slate"
    >
      <p class="text-sm text-muted mb-4">
        Surface ramps drive every dashboard token (bg-muted, text-default…).
        “{{ APPLIED.neutral }}” is live in global.css now.
      </p>
      <div class="space-y-5">
        <div v-for="(chroma, name) in neutralVariants" :key="name" class="space-y-1.5">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-highlighted">{{ name }}</span>
            <UiChip
              v-if="name === APPLIED.neutral"
              purpose="tag"
            >
              applied
            </UiChip>
          </div>
          <div class="flex gap-3">
            <div class="grid grid-cols-11 gap-1 flex-1">
              <div
                v-for="(l, i) in neutralL"
                :key="i"
                class="aspect-square rounded-md ring-1 ring-default"
                :style="{ background: swatch(l, chroma[i]) }"
              />
            </div>
            <div
              class="shrink-0 w-44 rounded-lg p-3 space-y-1.5"
              :style="{ background: swatch(neutralL[0], chroma[0]), boxShadow: `inset 0 0 0 1px ${swatch(neutralL[3], chroma[3])}` }"
            >
              <div class="text-xs font-medium" :style="{ color: swatch(neutralL[9], chroma[9]) }">
                Card surface
              </div>
              <div class="text-[11px]" :style="{ color: swatch(neutralL[5], chroma[5]) }">
                Muted body copy sample
              </div>
              <div class="h-6 rounded" :style="{ background: swatch(neutralL[2], chroma[2]) }" />
            </div>
          </div>
        </div>
      </div>
    </KitSection>

    <KitSection title="Semantic text" code="text-{token}">
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div v-for="t in semanticText" :key="t" class="rounded-md ring-1 ring-default p-3">
          <div :class="`text-${t}`" class="text-lg">
            {{ t }}
          </div>
          <code class="text-[10px] text-dimmed font-mono">text-{{ t }}</code>
        </div>
      </div>
    </KitSection>

    <KitSection title="Semantic surfaces" code="bg-{token}">
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div v-for="b in semanticBg" :key="b" :class="`bg-${b}`" class="rounded-md ring-1 ring-default p-6 text-sm" :data-text="b">
          <div :class="b === 'inverted' ? 'text-inverted' : 'text-default'">
            {{ b }}
          </div>
        </div>
      </div>
    </KitSection>

    <KitSection title="Borders" code="border-{token}">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="b in semanticBorder" :key="b" :class="`border-${b}`" class="rounded-md border-2 p-3 text-xs text-muted">
          border-{{ b }}
        </div>
      </div>
    </KitSection>
  </div>
</template>
