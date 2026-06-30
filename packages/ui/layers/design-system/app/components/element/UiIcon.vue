<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'

/**
 * UiIcon — the icon primitive. A thin, typed wrapper over Nuxt UI's `<UIcon>`.
 *
 * The `name` is a curated semantic role (`refresh`, `next`, `delete`, …) or a raw
 * `i-*` id. Roles resolve to the active set's icon via @nuxt/icon's global aliases
 * (registered in the design-system nuxt.config from the registry), so this component
 * passes `name` straight through — no runtime registry, nothing extra shipped to the
 * client. The `UiIcon` type keeps role autocomplete; type-only import is erased at build.
 *
 * To preview a specific set side-by-side (brand-kit /icons), call `resolveUiIcon(role, set)`
 * directly and feed the id to `<UIcon>` — that's the one place the registry runs client-side.
 */
const { name } = defineProps<{ name?: UiIcon }>()
</script>

<template>
  <UIcon :name="name" />
</template>
