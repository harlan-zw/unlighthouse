<script setup lang="ts">
/**
 * Thin wrapper around Nuxt UI v4's UPopover.
 *
 * Migrated from a HeadlessUI-based custom popover (v2 era).
 * The custom component originally existed to teleport the panel to <body>;
 * Nuxt UI v4's UPopover portals by default, so we just pass through.
 */

interface Props {
  mode?: 'click' | 'hover'
  open?: boolean
  disabled?: boolean
  openDelay?: number
  closeDelay?: number
  arrow?: boolean
  /** Positioning options forwarded to UPopover's `content` prop */
  content?: Record<string, any>
  /** @deprecated Use `content` with `side`/`align` instead */
  popper?: Record<string, any>
  /** Custom role attribute applied to the content wrapper */
  role?: string
  ui?: Record<string, any>
}

const { mode = 'click', openDelay = 0, closeDelay = 0, content, popper, arrow, disabled, role, ui } = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

// Merge our chrome class onto the popover content slot so every UiPopover
// inherits the tooltip-grade 5-layer shadow + inset edges without consumers
// having to opt in. Consumer-passed `ui.content` is preserved.
const mergedUi = computed(() => {
  const userContent = (ui as any)?.content
  const cls = 'ui-popover-content'
  return {
    ...(ui || {}),
    content: typeof userContent === 'string'
      ? `${cls} ${userContent}`
      : Array.isArray(userContent)
        ? [cls, ...userContent]
        : cls,
  }
})

const openModel = defineModel<boolean>('open')

// Map legacy `popper.placement` → Nuxt UI v4 `content.side` / `content.align`
const contentProps = computed(() => {
  if (content)
    return content
  if (!popper)
    return undefined

  const placement: string | undefined = popper.placement
  if (!placement)
    return undefined

  const [side, align] = placement.split('-')
  return {
    side,
    ...(align ? { align } : {}),
  }
})
</script>

<template>
  <UPopover
    v-model:open="openModel"
    :mode="mode"
    :open-delay="openDelay"
    :close-delay="closeDelay"
    :arrow="arrow"
    :content="contentProps"
    :disabled="disabled"
    :ui="mergedUi"
    @update:open="emit('update:open', $event)"
  >
    <slot />

    <template #content="slotProps">
      <div v-if="role" data-ui="UiPopover" :role="role">
        <slot name="panel" v-bind="slotProps" />
      </div>
      <slot v-else name="panel" v-bind="slotProps" />
    </template>
  </UPopover>
</template>
