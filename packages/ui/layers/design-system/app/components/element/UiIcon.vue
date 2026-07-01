<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'
import { computed } from 'vue'
import { resolveUiIcon } from '../../shared/ui-icons'

/**
 * UiIcon — the icon primitive. A thin, typed wrapper over Nuxt UI's `<UIcon>`.
 *
 * The `name` is a curated semantic role (`refresh`, `next`, `delete`, …) or a raw
 * `i-*` id. Resolve roles here so app code does not rely on @nuxt/icon alias
 * behavior; aliases remain configured for raw Nuxt UI components that receive
 * semantic icon props directly.
 */
const props = defineProps<{ name?: UiIcon }>()
const resolvedName = computed(() => resolveUiIcon(props.name))
</script>

<template>
  <UIcon :name="resolvedName" />
</template>
