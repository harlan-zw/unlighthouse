<script setup lang="ts">
import { computed } from 'vue'

type Palette = 'ink' | 'blue' | 'twilight' | 'dawn' | 'dusk' | 'dusk-vivid' | 'mist' | 'ash'
type Geometry = 'sky' | 'bloom' | 'wash' | 'veil'
type Intensity = 'subtle' | 'ambient' | 'present' | 'vivid'
type Preset = 'front-door' | 'error' | 'ai' | 'preview' | 'share'

const {
  palette: paletteProp,
  geometry: geometryProp,
  intensity: intensityProp,
  grain = true,
  preset,
} = defineProps<{
  palette?: Palette
  geometry?: Geometry
  intensity?: Intensity
  grain?: boolean
  preset?: Preset
}>()

const PRESETS: Record<Preset, { palette: Palette, geometry: Geometry, intensity: Intensity }> = {
  'front-door': { palette: 'twilight', geometry: 'bloom', intensity: 'present' },
  'error': { palette: 'twilight', geometry: 'sky', intensity: 'subtle' },
  'ai': { palette: 'dusk', geometry: 'bloom', intensity: 'ambient' },
  'preview': { palette: 'mist', geometry: 'veil', intensity: 'subtle' },
  'share': { palette: 'ink', geometry: 'wash', intensity: 'present' },
}

const base = computed(() => preset
  ? PRESETS[preset]
  : { palette: 'ash' as Palette, geometry: 'wash' as Geometry, intensity: 'ambient' as Intensity })
const palette = computed(() => paletteProp ?? base.value.palette)
const geometry = computed(() => geometryProp ?? base.value.geometry)
const intensity = computed(() => intensityProp ?? base.value.intensity)
</script>

<template>
  <div
    aria-hidden="true"
    class="ui-atmosphere"
    :data-geometry="geometry"
    :data-intensity="intensity"
    :data-grain="grain ? '' : undefined"
    :style="{ '--_atmo-greydient': `var(--greydient-${palette})` }"
  />
</template>
