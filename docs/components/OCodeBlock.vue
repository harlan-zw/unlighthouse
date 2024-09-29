<script setup lang="ts">
import type { BundledLanguage } from 'shiki'
import { useClipboard } from '@vueuse/core'
import { computed } from 'vue'
import { loadShiki, renderCodeHighlight } from '../composables/shiki'

const props = withDefaults(
  defineProps<{
    code: string
    lang?: BundledLanguage
    lines?: boolean
    transformRendered?: (code: string) => string
  }>(),
  {
    lines: true,
  },
)

loadShiki()

const clipboard = useClipboard()
const icon = ref('i-carbon-copy')
function copy() {
  clipboard.copy(props.code)
  icon.value = 'i-carbon-checkmark'

  setTimeout(() => {
    icon.value = 'i-carbon-copy'
  }, 2000)
}

const rendered = computed(() => {
  const code = renderCodeHighlight(props.code, props.lang)
  return props.transformRendered ? props.transformRendered(code.value || '') : code.value
})
</script>

<template>
  <div class="group relative">
    <UButton
      :icon="icon"
      variant="solid"
      class="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity z-[1]"
      size="xs"
      tabindex="-1"
      @click="copy"
    />
    <pre
      class="n-code-block"
      :class="lines ? 'n-code-block-lines' : ''"
      v-html="rendered"
    />
  </div>
</template>

<style>
.n-code-block-lines .shiki code {
  counter-reset: step;
  counter-increment: step calc(var(--start, 1) - 1);
}
.n-code-block-lines .shiki code .line::before {
  content: counter(step);
  counter-increment: step;
  width: 2rem;
  padding-right: 0.5rem;
  margin-right: 0.5rem;
  display: inline-block;
  text-align: right;
  --at-apply: text-truegray:50;
}
</style>
