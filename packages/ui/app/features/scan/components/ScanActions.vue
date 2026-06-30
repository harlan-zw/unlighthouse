<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()

async function handleCancel() {
  try {
    await store.cancelScan()
    toast.info('Scan cancelled')
  }
  catch (err) {
    toast.error('Failed to cancel', { description: err instanceof Error ? err.message : String(err) })
  }
}

async function handlePause() {
  try {
    await store.pauseScan()
    toast.info('Scan paused')
  }
  catch (err) {
    toast.error('Failed to pause', { description: err instanceof Error ? err.message : String(err) })
  }
}

async function handleResume() {
  try {
    await store.resumeScan()
    toast.info('Scan resumed')
  }
  catch (err) {
    toast.error('Failed to resume', { description: err instanceof Error ? err.message : String(err) })
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="store.isActive">
      <UiButton v-if="store.status === 'scanning'" purpose="secondary" size="sm" icon="pause" @click="handlePause">
        Pause
      </UiButton>

      <UModal
        title="Cancel scan?"
        description="This will stop the current scan. Completed results will be preserved."
      >
        <UiButton purpose="secondary" size="sm" icon="close" label="Cancel" />

        <template #footer="{ close }">
          <UiButton purpose="quiet" @click="close">
            Keep scanning
          </UiButton>
          <UiButton purpose="danger" @click="() => { handleCancel(); close() }">
            Cancel scan
          </UiButton>
        </template>
      </UModal>
    </template>

    <UiButton v-if="store.status === 'paused'" purpose="secondary" size="sm" icon="play" @click="handleResume">
      Resume
    </UiButton>
  </div>
</template>
