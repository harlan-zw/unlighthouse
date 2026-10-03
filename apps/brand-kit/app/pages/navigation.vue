<script setup lang="ts">
import type { UiNavLink } from '#design-system/app/shared/nav'
import type { UiStaticTerminalLine } from '#design-system/app/shared/static-terminal'

const mode = ref('browse')
const modes = [
  { label: 'Browse', value: 'browse', tabId: 'browse-tab', panelId: 'navigation-preview' },
  { label: 'Agents', value: 'agents', tabId: 'agents-tab', panelId: 'navigation-preview' },
]
const browseLinks: UiNavLink[] = [
  { label: 'Overview', to: '/navigation', icon: 'i-lucide-layout-dashboard' },
  { label: 'Tables', to: '/tables', icon: 'i-lucide-table' },
  { label: 'Charts', to: '/charts', icon: 'i-lucide-chart-line' },
]
const agentLinks: UiNavLink[] = [
  { label: 'Agent setup', to: '/navigation', icon: 'terminal', setup: { verb: 'Connect', tooltip: 'Connect an agent' } },
]
const lines: UiStaticTerminalLine[] = [
  { command: 'unlighthouse --help', note: 'Read the available commands' },
  { command: '{ "command": "unlighthouse", "args": ["mcp"] }', prompt: false, language: 'json' },
]
</script>

<template>
  <div class="space-y-10">
    <KitHeader title="Navigation & setup" description="Sidebar rows, mode tabs, and setup commands." />
    <KitSection title="Sidebar navigation">
      <div class="w-64 space-y-3 rounded-lg border border-default p-3">
        <UiTabs v-model="mode" :items="modes" aria-label="Workspace modes" />
        <div id="navigation-preview" role="tabpanel" :aria-labelledby="mode === 'browse' ? 'browse-tab' : 'agents-tab'">
          <UiNavList :links="mode === 'browse' ? browseLinks : agentLinks" variant="sidebar" :label="mode === 'browse' ? 'Browse' : 'Agents'" />
        </div>
      </div>
    </KitSection>
    <KitSection title="Setup commands">
      <UiStaticTerminal :lines="lines" title="Setup" />
    </KitSection>
  </div>
</template>
