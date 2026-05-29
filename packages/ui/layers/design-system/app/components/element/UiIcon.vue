<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'
import { computed } from 'vue'
import { resolveUiIcon } from '../../shared/ui-icons'

/**
 * UiIcon — the icon primitive. Wraps Nuxt UI's `UIcon` and resolves a curated
 * semantic name (`refresh`, `next`, `delete`, …) to its iconify id. Raw `i-*`
 * strings pass straight through, so it is a drop-in replacement for `<UIcon>`.
 *
 * Use this instead of `<UIcon>` anywhere the icon is a design choice, so the
 * whole design system speaks one curated icon vocabulary. See `ui-icons.ts`.
 */
const { name } = defineProps<{ name: UiIcon }>()

const resolved = computed(() => resolveUiIcon(name))
</script>

<template>
  <UIcon :name="resolved" />
</template>
