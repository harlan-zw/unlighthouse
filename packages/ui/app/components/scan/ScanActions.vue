<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useScanStore } from '~/stores/scan'

const store = useScanStore()
const api = useApi()

const cancelOpen = ref(false)

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
      <UButton v-if="store.status === 'scanning'" color="neutral" variant="outline" size="sm" @click="handlePause">
        <Icon name="lucide:pause" class="size-4 mr-1" />
        Pause
      </UButton>

      <UModal v-model:open="cancelOpen" title="Cancel scan?" description="This will stop the current scan. Completed results will be preserved.">
        <UButton color="neutral" variant="outline" size="sm">
          <Icon name="lucide:x" class="size-4 mr-1" />
          Cancel
        </UButton>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton color="neutral" variant="ghost" @click="cancelOpen = false">
              Keep scanning
            </UButton>
            <UButton color="error" @click="cancelOpen = false; handleCancel()">
              Cancel scan
            </UButton>
          </div>
        </template>
      </UModal>
    </template>

    <UButton v-if="store.status === 'paused'" color="neutral" variant="outline" size="sm" @click="handleResume">
      <Icon name="lucide:play" class="size-4 mr-1" />
      Resume
    </UButton>
  </div>
</template>
