import { createSharedComposable } from '@vueuse/core'

function _useDocs() {
  const isSearchModalOpen = ref(false)

  return {
    isSearchModalOpen,
  }
}

export const useDocs = createSharedComposable(_useDocs)
