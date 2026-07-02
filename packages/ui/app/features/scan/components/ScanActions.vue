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
    toast.error('Cancel scan failed', { description: `${err instanceof Error ? err.message : String(err)}. Check the scan host and retry.` })
  }
}

async function handlePause() {
  try {
    await store.pauseScan()
    toast.info('Scan paused')
  }
  catch (err) {
    toast.error('Pause scan failed', { description: `${err instanceof Error ? err.message : String(err)}. Check the scan host and retry.` })
  }
}

async function handleResume() {
  try {
    await store.resumeScan()
    toast.info('Scan resumed')
  }
  catch (err) {
    toast.error('Resume scan failed', { description: `${err instanceof Error ? err.message : String(err)}. Check the scan host and retry.` })
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="store.isActive">
      <UiButton v-if="store.status === 'scanning'" purpose="secondary" size="sm" icon="pause" @click="handlePause">
        Pause scan
      </UiButton>

      <UModal
        title="Cancel scan?"
        description="This will stop the current scan. Completed results will be preserved."
      >
        <UiButton purpose="secondary" size="sm" icon="close" label="Cancel scan" />

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
      Resume scan
    </UiButton>
  </div>
</template>
