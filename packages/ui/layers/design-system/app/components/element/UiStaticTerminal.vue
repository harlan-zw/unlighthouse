<script setup lang="ts">
import type { UiStaticTerminalLine } from '../../shared/static-terminal'
import { useClipboard } from '@vueuse/core'
import { computed } from 'vue'
import { highlightCode } from '../../../shared/rangi'

const {
  lines,
  copyLines,
  title = 'zsh',
  cwd = '~',
  language = 'bash',
} = defineProps<{
  lines: UiStaticTerminalLine[]
  /** Plaintext commands to copy when the visible commands mask a secret. */
  copyLines?: UiStaticTerminalLine[]
  title?: string
  cwd?: string
  language?: string
}>()

const { copy, copied } = useClipboard({ legacy: true })
const copyText = computed(() => (copyLines ?? lines).map(line => line.command).join('\n'))
const renderedLines = computed(() => lines.map(line => ({
  ...line,
  noteHtml: line.note ? highlightCode(`# ${line.note}`, 'bash').html : null,
  commandHtml: highlightCode(line.command, line.language ?? language).html,
  outputHtml: line.output ? highlightCode(line.output, line.outputLanguage ?? 'plain').html : null,
})))
</script>

<template>
  <div class="ui-static-terminal overflow-hidden rounded-xl border shadow-sm">
    <div class="ui-static-terminal__chrome flex items-center gap-2 border-b px-3 py-1.5">
      <span class="flex items-center gap-1.5" aria-hidden="true">
        <span class="ui-static-terminal__dot size-2.5 rounded-full" />
        <span class="ui-static-terminal__dot size-2.5 rounded-full" />
        <span class="ui-static-terminal__dot size-2.5 rounded-full" />
      </span>
      <span class="ui-static-terminal__muted ml-1 min-w-0 flex-1 truncate font-mono text-mini">{{ cwd }} · {{ title }}</span>
      <UiButton
        :icon="copied ? 'check' : 'copy'"
        purpose="quiet"
        size="xs"
        class="ui-static-terminal__copy min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
        :aria-label="copied ? 'Copied' : 'Copy commands'"
        @click="copy(copyText)"
      />
    </div>

    <div class="overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed">
      <div v-for="(line, index) in renderedLines" :key="index" :class="index > 0 ? 'mt-3' : ''">
        <!-- Rangi escapes source text before creating this token markup. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <pre v-if="line.noteHtml" class="ui-static-terminal__muted m-0 whitespace-pre"><code class="rangi shj-lang-bash" v-html="line.noteHtml" /></pre>
        <pre class="m-0 whitespace-pre"><span v-if="line.prompt !== false" class="select-none text-primary-500 dark:text-primary-400" aria-hidden="true">$ </span><!-- eslint-disable-next-line vue/no-v-html --><code class="rangi" :class="`shj-lang-${line.language ?? language}`" v-html="line.commandHtml" /></pre>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <pre v-if="line.outputHtml" class="ui-static-terminal__output m-0 whitespace-pre"><code class="rangi" :class="`shj-lang-${line.outputLanguage ?? 'plain'}`" v-html="line.outputHtml" /></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ui-static-terminal {
  --terminal-bg: light-dark(oklch(0.985 0.002 286), oklch(0.145 0.008 326));
  --terminal-chrome: light-dark(oklch(0.965 0.004 286), oklch(0.18 0.01 326));
  --terminal-fg: light-dark(oklch(0.21 0.008 286), oklch(0.985 0 0));
  --terminal-muted: light-dark(oklch(0.48 0.012 286), oklch(0.69 0.018 326));
  --terminal-output: light-dark(oklch(0.39 0.01 286), oklch(0.76 0.014 326));
  --terminal-border: light-dark(oklch(0.89 0.008 286), oklch(0.28 0.014 326));
  background: var(--terminal-bg);
  border-color: var(--terminal-border);
  color: var(--terminal-fg);
}

.ui-static-terminal__chrome {
  background: var(--terminal-chrome);
  border-color: var(--terminal-border);
}

.ui-static-terminal__dot {
  background: oklch(0.66 0.18 25);
}

.ui-static-terminal__dot:nth-child(2) {
  background: oklch(0.78 0.15 82);
}

.ui-static-terminal__dot:nth-child(3) {
  background: oklch(0.7 0.15 145);
}

.ui-static-terminal__muted {
  color: var(--terminal-muted);
}

.ui-static-terminal__output,
.ui-static-terminal__copy {
  color: var(--terminal-output) !important;
}

.ui-static-terminal__copy:hover {
  color: var(--terminal-fg) !important;
}
</style>
