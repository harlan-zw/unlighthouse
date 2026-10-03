<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { agentShell, agentSkill, buildAgentPrompt, buildClaudeCommand, buildMcpConfig, parseAgentSetup } from '~/features/agents/setup'

usePageTitle('Agents')

const route = useRoute()
const root = useState('agents:project-root', () => '')
const site = ref(typeof route.query.site === 'string' ? route.query.site : '')
watch(() => route.query.site, (value) => {
  if (typeof value === 'string')
    site.value = value
})
const isStatic = useIsStatic()
const { data: sitesData } = useApiQuery('sites.list', () => ({}))
const sites = computed(() => sitesData.value?.sites ?? [])
const parsedSetup = computed(() => parseAgentSetup({ root: root.value, site: site.value }))
const rootError = computed(() => parsedSetup.value._tag === 'InvalidRoot'
  ? 'Enter an absolute project path.'
  : undefined)
const siteError = computed(() => parsedSetup.value._tag === 'InvalidSite'
  ? 'Enter a URL starting with http:// or https://.'
  : undefined)
const setup = computed(() => parsedSetup.value._tag === 'Ready' ? parsedSetup.value.setup : null)
const ready = computed(() => setup.value !== null)
const shell = computed(() => setup.value ? agentShell(setup.value) : '')
const command = computed(() => setup.value ? buildClaudeCommand(setup.value) : '')
const config = computed(() => setup.value ? buildMcpConfig(setup.value) : '')
const prompt = computed(() => setup.value ? buildAgentPrompt(setup.value) : '')

function copySetupPrompt() {
  if (setup.value)
    return copyText(prompt.value)
}

async function copyText(text: string) {
  if (!navigator.clipboard) {
    toast.error('Could not copy. Select the text and copy it manually.')
    return
  }
  await navigator.clipboard.writeText(text)
    .then(() => toast.success('Copied to clipboard'))
    .catch(() => toast.error('Could not copy. Select the text and copy it manually.'))
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <UiPageHeader title="Agents" flush>
      <template #actions>
        <UiButton to="https://unlighthouse.dev/integrations/mcp" target="_blank" purpose="quiet" icon="external">
          Read MCP docs
        </UiButton>
      </template>
    </UiPageHeader>

    <UiAlert
      v-if="isStatic"
      status="info"
      title="MCP needs the original scan output"
      description="This exported report cannot host MCP. Use the project that contains the scans."
    />

    <UiCard id="mcp">
      <template #header>
        <h2 class="break-words font-strong text-default">
          MCP
        </h2>
        <p class="text-sm text-muted mt-1">
          Read scan history, run audit packs, and inspect routes from your agent.
        </p>
      </template>
      <div class="space-y-6">
        <p class="text-sm text-muted">
          Use your v1 installation of Unlighthouse. The local <CodeBlock inline code="unlighthouse-mcp" /> executable must be available to your MCP client.
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Project root" required :error="rootError" hint="Absolute path">
            <UInput v-model="root" placeholder="/absolute/path/to/project" class="w-full font-mono" :ui="{ base: 'min-h-11 lg:min-h-10' }" :spellcheck="false" autocomplete="off" />
          </UFormField>
          <UFormField label="Site URL" :error="siteError" hint="Optional">
            <UInput v-model="site" list="agent-sites" placeholder="https://example.com" class="w-full font-mono" :ui="{ base: 'min-h-11 lg:min-h-10' }" :spellcheck="false" autocomplete="url" />
            <datalist id="agent-sites">
              <option v-for="entry in sites" :key="entry.id" :value="entry.url">
                {{ entry.name }}
              </option>
            </datalist>
          </UFormField>
        </div>
        <p class="text-sm text-muted">
          Use the project root that contains your Unlighthouse config and scan output.
          If you omit the site, Unlighthouse selects the site with the most stored scans.
        </p>
        <UiButton purpose="cta" icon="copy" :disabled="!ready" @click="copySetupPrompt">
          Copy setup prompt
        </UiButton>
        <p class="text-sm text-muted">
          Paste the prompt into an agent that can run terminal commands.
        </p>
        <Disclosure v-if="ready" label="View setup prompt">
          <CodeBlock :code="prompt" tabindex="0" role="region" aria-label="Setup prompt" class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </Disclosure>

        <div v-if="ready" class="space-y-6 border-t border-default pt-6">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-heading">
                Claude Code
              </h3>
              <UiButton purpose="quiet" size="sm" icon="copy" @click="copyText(command)">
                Copy command
              </UiButton>
            </div>
            <p class="text-sm text-muted">
              Run this command in {{ shell }}. Use the MCP config below for other shells.
            </p>
            <UiStaticTerminal class="agent-setup-terminal" :lines="[{ command }]" :cwd="root.trim()" :title="shell" />
          </div>
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-heading">
                MCP config
              </h3>
              <UiButton purpose="quiet" size="sm" icon="copy" @click="copyText(config)">
                Copy config
              </UiButton>
            </div>
            <p class="text-sm text-muted">
              Merge this into your client's MCP config. Restart or reconnect the client after saving.
            </p>
            <UiStaticTerminal class="agent-setup-terminal" :lines="[{ command: config, prompt: false, language: 'json' }]" title="MCP config" language="json" :cwd="root.trim()" />
          </div>
        </div>
      </div>
    </UiCard>

    <UiCard id="skill">
      <template #header>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="break-words font-strong text-default">
              Skill
            </h2>
            <p class="text-sm text-muted mt-1">
              Give your agent the scan summary, audit pack, and route inspection workflow.
            </p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UiButton purpose="secondary" icon="copy" @click="copyText(agentSkill)">
              Copy instructions
            </UiButton>
          </div>
        </div>
      </template>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Save these instructions as <CodeBlock inline code="SKILL.md" /> in your agent's skill directory.
          Follow your client's skill setup guide. Connect MCP before using the skill.
        </p>
        <Disclosure label="View SKILL.md">
          <CodeBlock :code="agentSkill" tabindex="0" role="region" aria-label="Skill" class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </Disclosure>
      </div>
    </UiCard>
  </div>
</template>

<style scoped>
.agent-setup-terminal :deep(.ui-static-terminal__copy) {
  display: none;
}

.agent-setup-terminal :deep(pre),
.agent-setup-terminal :deep(pre code) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
