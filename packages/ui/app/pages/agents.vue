<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
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
const { copy } = useClipboard({ legacy: true })
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

function copySetupPrompt() {
  if (setup.value)
    return copyText(buildAgentPrompt(setup.value))
}

async function copyText(text: string) {
  await copy(text)
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

    <UiCard id="mcp" title="MCP" description="Read scan history, run audit packs, and inspect routes from your agent.">
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

        <div v-if="ready" class="space-y-6 border-t border-default pt-6">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-heading">
                Claude Code
              </h2>
              <UiButton purpose="quiet" size="sm" icon="copy" @click="copyText(command)">
                Copy command
              </UiButton>
            </div>
            <p class="text-sm text-muted">
              Run this command in {{ shell }}. Use the MCP config below for other shells.
            </p>
            <UiStaticTerminal :lines="[{ command }]" :cwd="root.trim()" :title="shell" />
          </div>
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-heading">
                MCP config
              </h2>
              <UiButton purpose="quiet" size="sm" icon="copy" @click="copyText(config)">
                Copy config
              </UiButton>
            </div>
            <p class="text-sm text-muted">
              Merge this into your client's MCP config. Restart or reconnect the client after saving.
            </p>
            <UiStaticTerminal :lines="[{ command: config, prompt: false, language: 'json' }]" title="MCP config" language="json" :cwd="root.trim()" />
          </div>
        </div>
      </div>
    </UiCard>

    <UiCard id="skill" title="Skill" description="Give your agent the scan summary, audit pack, and route inspection workflow.">
      <template #actions>
        <UiButton purpose="secondary" icon="copy" @click="copyText(agentSkill)">
          Copy instructions
        </UiButton>
      </template>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Save these instructions as <CodeBlock inline code="SKILL.md" /> in your agent's skill directory.
          Follow your client's skill setup guide. Connect MCP before using the skill.
        </p>
        <Disclosure label="View SKILL.md">
          <CodeBlock :code="agentSkill" />
        </Disclosure>
      </div>
    </UiCard>
  </div>
</template>
