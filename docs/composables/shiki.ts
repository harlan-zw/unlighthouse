import type { MaybeRef } from '@vueuse/core'
import type { BundledLanguage, Highlighter } from 'shiki'
import { useColorMode } from '#imports'
import { getHighlighter } from 'shiki'
import { computed, ref, unref } from 'vue'

export const shiki = ref<Highlighter>()

export function loadShiki() {
  if (shiki.value)
    return
  // Only loading when needed
  return getHighlighter({
    themes: [
      'vitesse-dark',
      'vitesse-light',
    ],
    langs: [
      'css',
      'javascript',
      'typescript',
      'html',
      'vue',
      'vue-html',
      'bash',
      'diff',
    ],
  }).then((i) => {
    shiki.value = i
  })
}

export function renderCodeHighlight(code: MaybeRef<string>, lang: BundledLanguage) {
  const colorMode = useColorMode()
  return computed(() => {
    if (!shiki.value)
      return code
    return shiki.value!.codeToHtml(unref(code), {
      lang,
      theme: colorMode.value === 'dark' ? 'vitesse-dark' : 'vitesse-light',
    }) || ''
  })
}
