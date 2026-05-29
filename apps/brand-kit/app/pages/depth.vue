<script lang="ts" setup>
const radii = ['sm', 'md', 'lg', 'xl', '2xl', 'full'] as const

// Tier B — elevation presets. The component-facing API; mirrors the comment
// block in layers/design-system/css/global.css.
const tiers = [
  {
    name: 'inset',
    token: '--elevation-inset',
    use: 'Recessed, carved edge, no lift. Resting stat cards, skeletons, nested wells.',
    style: { boxShadow: 'var(--elevation-inset)', backgroundColor: 'var(--ui-bg)' },
  },
  {
    name: 'flat',
    token: '--elevation-flat',
    use: 'Hairline ring, zero lift. Dashboard data cards, table shells, list rows.',
    style: { boxShadow: 'var(--elevation-flat)', backgroundColor: 'var(--ui-bg)' },
  },
  {
    name: 'raised',
    token: '--elevation-raised',
    use: 'Resting drop shadow + bevel. Marketing cards, card hover states.',
    style: { boxShadow: 'var(--elevation-raised)', backgroundColor: 'var(--ui-bg)' },
  },
  {
    name: 'overlay',
    token: '--elevation-overlay',
    use: 'Atmospheric shadow + bevel. Modals, drawers, alerts, sticky headers.',
    style: { boxShadow: 'var(--elevation-overlay)', backgroundColor: 'var(--ui-bg)' },
  },
  {
    name: 'popover',
    token: '--elevation-popover',
    use: 'Atmospheric + brand bevel, paired with the --surface-raised fill. Tooltip, popover, dropdown.',
    style: { boxShadow: 'var(--elevation-popover)', backgroundImage: 'var(--surface-raised)', backgroundColor: 'var(--ui-bg)' },
  },
] as const

// Bevel anatomy — decompose --elevation-popover into its tier-A ingredients.
const bevelSteps = [
  {
    label: 'ambient-high',
    desc: 'Three stacked drop shadows: tight contact, mid, soft far. The lift.',
    style: { boxShadow: 'var(--_depth-ambient-high)' },
  },
  {
    label: '+ bevel-brand',
    desc: 'Inset edge: primary top highlight, dark bottom shade. The carved brand edge.',
    style: { boxShadow: 'var(--_depth-ambient-high), var(--_depth-bevel-brand)' },
  },
  {
    label: '+ surface-raised',
    desc: 'Top-lit gradient fill. The composed result is --elevation-popover.',
    style: { boxShadow: 'var(--_depth-ambient-high), var(--_depth-bevel-brand)', backgroundImage: 'var(--surface-raised)' },
  },
] as const

// Two-tier token reference.
const ingredients = [
  ['--_depth-ambient-low', 'resting drop shadow'],
  ['--_depth-ambient-high', 'atmospheric 3-layer drop shadow'],
  ['--_depth-bevel', 'inset edge: white highlight + dark shade'],
  ['--_depth-bevel-brand', 'inset edge: primary highlight + dark shade'],
  ['--_depth-ring', '1px inset hairline'],
  ['--_depth-sheen', 'top-lit gradient fill'],
] as const

const popoverBody = '<p>Body content sits on the same beveled chrome as tooltips.</p>'
</script>

<template>
  <div class="space-y-10">
    <KitHeader
      eyebrow="Foundation"
      title="Depth & elevation"
      description="How global.css builds physical depth. Two tiers: private --_depth-* ingredients compose into the component-facing --elevation-* presets. Components reference only the presets."
    />

    <KitSection
      title="Elevation ladder"
      code="--elevation-*"
      description="Five presets, low to high. A component picks one; never an inline box-shadow value."
    >
      <div class="divide-y divide-accented rounded-xl bg-accented px-2">
        <div
          v-for="(t, i) in tiers"
          :key="t.name"
          class="flex items-center gap-5 px-4 py-5"
        >
          <div
            class="grid size-20 shrink-0 place-items-center rounded-lg text-2xl font-semibold text-highlighted numerals-display"
            :style="t.style"
          >
            {{ i }}
          </div>
          <div class="min-w-0 space-y-1">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-semibold text-highlighted">{{ t.name }}</span>
              <code class="font-mono text-[11px] text-primary-500">{{ t.token }}</code>
            </div>
            <p class="text-sm text-muted">
              {{ t.use }}
            </p>
          </div>
        </div>
      </div>
    </KitSection>

    <KitSection
      title="Two-tier tokens"
      code="--_depth-* → --elevation-*"
      description="Ingredients are private atoms (underscore prefix), never used by components. Presets compose them by comma-concatenation, so dark mode is tuned once on the ingredients."
    >
      <div class="grid gap-3 rounded-xl bg-accented p-6 sm:grid-cols-2">
        <div
          v-for="[name, note] in ingredients"
          :key="name"
          class="flex items-baseline justify-between gap-3 rounded-lg bg-default px-3 py-2"
        >
          <code class="font-mono text-[11px] text-highlighted">{{ name }}</code>
          <span class="text-[11px] text-dimmed">{{ note }}</span>
        </div>
      </div>
    </KitSection>

    <KitSection
      title="Bevel anatomy"
      code="--elevation-popover"
      description="The popover preset is its ingredients stacked. Each card adds one; the surface underneath is identical. Shown on a dark surface — the bevel highlight and top-lit fill are light effects that only register against darker chrome."
    >
      <div class="grid gap-6 rounded-xl bg-accented p-8 md:grid-cols-3">
        <div v-for="s in bevelSteps" :key="s.label" class="space-y-2">
          <div
            class="grid h-28 place-items-center rounded-xl bg-[var(--color-neutral-900)] text-xs font-medium text-[var(--color-neutral-300)]"
            :style="s.style"
          >
            {{ s.label }}
          </div>
          <p class="text-[11px] leading-snug text-dimmed">
            {{ s.desc }}
          </p>
        </div>
      </div>
    </KitSection>

    <KitSection
      title="Detached chrome — live"
      code=".ui-popover-content · .ui-alert"
      description="Tooltip, popover and dropdown all consume --elevation-popover + --surface-raised. Alerts use --elevation-overlay (no brand edge — the semantic accent owns the top edge). Change a token once, every overlay updates."
    >
      <div class="flex flex-wrap items-center gap-4 rounded-md border border-default p-8">
        <UiTooltip title="Tooltip chrome" description="box-shadow: var(--elevation-popover)">
          <UiButton size="sm" purpose="secondary">
            Hover — tooltip
          </UiButton>
        </UiTooltip>

        <UiPopover mode="click" :content="{ side: 'bottom', align: 'start' }">
          <UiButton size="sm" purpose="secondary">
            Click — popover
          </UiButton>
          <template #panel>
            <div class="max-w-xs space-y-1 p-4">
              <div class="text-sm font-semibold text-highlighted">
                Popover panel
              </div>
              <p class="text-xs text-muted">
                Same beveled chrome as the tooltip, applied via <code class="font-mono">.ui-popover-content</code>.
              </p>
            </div>
          </template>
        </UiPopover>

        <UDropdownMenu
          :items="[[{ label: 'Edit', icon: 'i-lucide-pencil' }, { label: 'Duplicate', icon: 'i-lucide-copy' }], [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' }]]"
        >
          <UiButton size="sm" purpose="secondary" trailing-icon="i-lucide-chevron-down">
            Click — dropdown
          </UiButton>
        </UDropdownMenu>

        <UiTooltip :html="popoverBody" size="md">
          <UiButton size="sm" purpose="secondary">
            Rich tooltip body
          </UiButton>
        </UiTooltip>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <UiAlert title="Inline alert" description="Alerts use --elevation-overlay + --surface-raised." icon="i-carbon-information" />
        <UiAlert status="warning" title="Tinted alert" description="Color-tinted bg/border layers under the shared sheen." icon="i-carbon-warning" />
      </div>
    </KitSection>

    <KitSection
      title="Interaction depth"
      code="--elevation-hover · --fx-accent"
      description="The hover halo is its own preset — an accent-tinted ambient lift, hover-only. Buttons use it; any surface can. --fx-accent tints it: neutral by default, primary for a brand glow."
    >
      <div class="flex flex-wrap gap-4">
        <div class="fx-tile">
          <span class="text-xs font-medium text-muted">Hover — neutral halo</span>
          <code class="font-mono text-[10px] text-dimmed">--fx-accent: --ui-text</code>
        </div>
        <div class="fx-tile fx-tile--brand">
          <span class="text-xs font-medium text-muted">Hover — brand halo</span>
          <code class="font-mono text-[10px] text-dimmed">--fx-accent: primary</code>
        </div>
        <div class="grid place-items-center">
          <UiButton purpose="cta" size="lg">
            Buttons ride the same token
          </UiButton>
        </div>
      </div>
    </KitSection>

    <KitSection title="Radius scale" code="rounded-*">
      <div class="grid grid-cols-3 gap-3 md:grid-cols-6">
        <div v-for="r in radii" :key="r" class="space-y-2">
          <div :class="`rounded-${r}`" class="aspect-square bg-elevated ring-1 ring-default" />
          <code class="font-mono text-[10px] text-dimmed">rounded-{{ r }}</code>
        </div>
      </div>
    </KitSection>
  </div>
</template>

<style scoped>
.fx-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 14rem;
  padding: 1.25rem;
  border-radius: 0.75rem;
  background-color: var(--ui-bg);
  box-shadow: var(--elevation-raised);
  transition: box-shadow 240ms var(--ease-standard), transform 240ms var(--ease-standard);
}
.fx-tile:hover {
  transform: translateY(-2px);
  box-shadow: var(--elevation-raised), var(--elevation-hover);
}
.fx-tile--brand {
  --fx-accent: var(--ui-color-primary-500);
}
</style>
