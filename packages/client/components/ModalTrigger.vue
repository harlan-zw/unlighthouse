<script setup lang="ts">
// Modal trigger component that handles the common pattern of opening modals
// with teleport functionality
import { iframeModalUrl, isModalOpen } from '../logic'

const showingModal = ref(false)

function openModal() {
  isModalOpen.value = true
  iframeModalUrl.value = null
  nextTick(() => {
    showingModal.value = true
  })
}

// reset on modal closing
watch(isModalOpen, () => {
  if (!isModalOpen.value)
    showingModal.value = false
})
</script>

<template>
  <div>
    <!-- Trigger element -->
    <button
      type="button"
      class="btn-unstyled"
      @click="openModal"
    >
      <slot name="trigger" :open="openModal" />
    </button>

    <!-- Modal content -->
    <teleport v-if="isModalOpen && showingModal" to="#modal-portal">
      <slot name="modal" :close="() => isModalOpen.value = false" />
    </teleport>
  </div>
</template>
