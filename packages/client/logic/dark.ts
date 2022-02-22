import { useStorage, useToggle } from '@vueuse/core'

export const mode = useStorage('vueuse-color-scheme', 'dark')
export const isDark = computed<boolean>({
  get() {
    return mode.value === 'dark'
  },
  set(v) {
    mode.value = v ? 'dark' : 'light'
  },
})

watch(isDark, () => {
  const el = window?.document.querySelector('html')
  if (!el)
    return
  if (isDark.value) {
    el.classList.add('dark')
    el.classList.remove('light')
  }
  else {
    el.classList.add('light')
    el.classList.remove('dark')
  }
}, { flush: 'post', immediate: true })

export const toggleDark = useToggle(isDark)
