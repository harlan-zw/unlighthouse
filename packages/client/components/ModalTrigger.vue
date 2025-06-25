<script setup lang="ts">
// Modal trigger component that handles the common pattern of opening modals
// with teleport functionality
import { contentModalOpen, openContentModal } from '../logic'

const showingModal = ref(false)

function openModal() {
  openContentModal()
  nextTick(() => {
    showingModal.value = true
  })
}

// reset on modal closing
watch(contentModalOpen, () => {
  if (!contentModalOpen.value)
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
    <teleport v-if="contentModalOpen && showingModal" to="#modal-portal">
      <slot name="modal" :close="() => contentModalOpen.value = false" />
    </teleport>
  </div>
</template>
