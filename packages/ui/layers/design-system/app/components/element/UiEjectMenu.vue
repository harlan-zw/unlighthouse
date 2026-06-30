<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router'
import type { EjectAction, EjectChat, EjectLink, EjectMcp } from './eject-menu'
import { useClipboard } from '@vueuse/core'
import { computed } from 'vue'

const {
  curl,
  mcp,
  chat,
  schema,
  cli,
  actions,
  size = 'xs',
  align = 'end',
} = defineProps<{
  curl?: string
  mcp?: EjectMcp | string
  chat?: EjectChat
  schema?: EjectLink
  cli?: string
  actions?: EjectAction[]
  size?: 'xs' | 'sm' | 'md'
  align?: 'start' | 'center' | 'end'
}>()

const toast = useToast()
const { copy } = useClipboard({ legacy: true })

async function copyAs(label: string, payload: string) {
  await copy(payload)
  toast.add({
    title: `${label} copied`,
    icon: 'check',
    color: 'success',
    duration: 2000,
  })
}

function buildChatTarget(c: EjectChat): RouteLocationRaw {
  const query: LocationQueryRaw = {}
  if (c.entity)
    query.entity = c.entity
  if (c.filter)
    query.filter = JSON.stringify(c.filter)
  if (c.seed)
    query.seed = c.seed
  if (c.autoSend)
    query.autoSend = '1'
  if (!c.to)
    return { query }
  if (typeof c.to === 'string')
    return { path: c.to, query }
  return { ...c.to, query: { ...c.to.query, ...query } }
}

const ejectItems = computed<DropdownMenuItem[]>(() => {
  const out: DropdownMenuItem[] = []
  if (curl) {
    out.push({
      label: 'Copy as cURL',
      icon: 'terminal',
      onSelect: () => copyAs('cURL', curl),
    })
  }
  if (mcp) {
    const payload = typeof mcp === 'string' ? mcp : JSON.stringify(mcp, null, 2)
    out.push({
      label: 'Copy as MCP call',
      icon: 'plug',
      onSelect: () => copyAs('MCP call', payload),
    })
  }
  if (chat) {
    out.push({
      label: 'Open in AI Chat',
      icon: 'bot',
      to: buildChatTarget(chat),
    })
  }
  if (schema) {
    out.push({
      label: schema.label ?? 'View API schema',
      icon: 'braces',
      to: schema.to,
    })
  }
  if (cli) {
    out.push({
      label: 'Run in CLI',
      icon: 'command',
      onSelect: () => copyAs('CLI command', cli),
    })
  }
  return out
})

const actionItems = computed<DropdownMenuItem[]>(() =>
  (actions ?? []).map(action => ({
    label: action.label,
    icon: action.icon,
    disabled: action.disabled,
    onSelect: action.onSelect,
  })),
)

const items = computed<DropdownMenuItem[] | DropdownMenuItem[][]>(() => {
  if (actionItems.value.length && ejectItems.value.length)
    return [actionItems.value, ejectItems.value]
  return actionItems.value.length ? actionItems.value : ejectItems.value
})

const hasAny = computed(() => actionItems.value.length > 0 || ejectItems.value.length > 0)
</script>

<template>
  <UDropdownMenu
    v-if="hasAny"
    :items="items"
    :content="{ align, sideOffset: 6 }"
    :ui="{ content: 'ui-popover-content' }"
  >
    <UiButton
      purpose="quiet"
      :size="size"
      icon="more-horizontal"
      aria-label="Eject this view to code"
      class="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
    />
  </UDropdownMenu>
</template>
