<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router'
import { useClipboard } from '@vueuse/core'
import { computed } from 'vue'

export interface EjectChat {
  to: RouteLocationRaw
  entity?: string
  filter?: Record<string, unknown>
  seed?: string
  // v1.3: when true, the chat page fires `sendMessage(seed)` automatically
  // after hydrate resolves. Opt-in per ejecting surface; reserve for seeds
  // generated from real page state (eg. GSC top queries with a date range).
  autoSend?: boolean
}

export interface EjectLink {
  to: RouteLocationRaw
  label?: string
}

export interface EjectMcp {
  tool: string
  args?: Record<string, unknown>
}

const {
  curl,
  mcp,
  chat,
  schema,
  cli,
  size = 'xs',
  align = 'end',
} = defineProps<{
  curl?: string
  mcp?: EjectMcp | string
  chat?: EjectChat
  schema?: EjectLink
  cli?: string
  size?: 'xs' | 'sm' | 'md'
  align?: 'start' | 'center' | 'end'
}>()

const toast = useToast()
const { copy, isSupported } = useClipboard({ legacy: true })

async function copyAs(label: string, payload: string) {
  await copy(payload)
  toast.add({
    title: `${label} copied`,
    icon: 'i-lucide-check',
    color: 'success',
    duration: 2000,
  })
}

// URL contract is owned by layers/chat/app/internal/schemas/chat-deep-link.ts.
// Keep `entity` / `filter` / `seed` writes here in sync with that schema.
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
  if (typeof c.to === 'string')
    return { path: c.to, query }
  return { ...c.to, query: { ...c.to.query, ...query } }
}

const items = computed<DropdownMenuItem[]>(() => {
  const out: DropdownMenuItem[] = []
  if (curl) {
    out.push({
      label: 'Copy as cURL',
      icon: 'i-lucide-terminal',
      onSelect: () => copyAs('cURL', curl),
    })
  }
  if (mcp) {
    const payload = typeof mcp === 'string' ? mcp : JSON.stringify(mcp, null, 2)
    out.push({
      label: 'Copy as MCP call',
      icon: 'i-lucide-plug-zap',
      onSelect: () => copyAs('MCP call', payload),
    })
  }
  if (chat) {
    out.push({
      label: 'Open in AI Chat',
      icon: 'i-lucide-message-square-code',
      to: buildChatTarget(chat),
    })
  }
  if (schema) {
    out.push({
      label: schema.label ?? 'View API schema',
      icon: 'i-lucide-braces',
      to: schema.to,
    })
  }
  if (cli) {
    out.push({
      label: 'Run in CLI',
      icon: 'i-lucide-square-chevron-right',
      onSelect: () => copyAs('CLI command', cli),
    })
  }
  return out
})

const hasAny = computed(() => items.value.length > 0)
</script>

<template>
  <UDropdownMenu
    v-if="hasAny && isSupported"
    :items="items"
    :content="{ align, sideOffset: 6 }"
    :ui="{ content: 'ui-popover-content' }"
  >
    <UiButton
      purpose="quiet"
      :size="size"
      icon="i-lucide-code-2"
      label="Eject"
      trailing-icon="i-lucide-chevron-down"
      aria-label="Eject this view to code"
    />
  </UDropdownMenu>
</template>
