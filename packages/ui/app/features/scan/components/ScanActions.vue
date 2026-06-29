<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()
const api = useApi()

async function handleCancel() {
  try {
    await store.cancelScan(api)
    toast.info('Scan cancelled')
  }
  catch (err: any) {
    toast.error('Failed to cancel', { description: err.message })
  }
}

async function handlePause() {
  try {
    await store.pauseScan(api)
    toast.info('Scan paused')
  }
  catch (err: any) {
    toast.error('Failed to pause', { description: err.message })
  }
}

async function handleResume() {
  try {
    await store.resumeScan(api)
    toast.info('Scan resumed')
  }
  catch (err: any) {
    toast.error('Failed to resume', { description: err.message })
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="store.isActive">
      <UiButton v-if="store.status === 'scanning'" purpose="secondary" size="sm" icon="i-lucide-pause" @click="handlePause">
        Pause
      </UiButton>

      <UModal
        title="Cancel scan?"
        description="This will stop the current scan. Completed results will be preserved."
      >
        <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-x" label="Cancel" />

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

    <UiButton v-if="store.status === 'paused'" purpose="secondary" size="sm" icon="i-lucide-play" @click="handleResume">
      Resume
    </UiButton>
  </div>
</template>
