<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
      <Button v-if="store.status === 'scanning'" variant="outline" size="sm" @click="handlePause">
        <Icon name="lucide:pause" class="size-4 mr-1" />
        Pause
      </Button>

      <AlertDialog>
        <AlertDialogTrigger as-child>
          <Button variant="outline" size="sm">
            <Icon name="lucide:x" class="size-4 mr-1" />
            Cancel
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the current scan. Completed results will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep scanning</AlertDialogCancel>
            <AlertDialogAction @click="handleCancel">
              Cancel scan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </template>

    <Button v-if="store.status === 'paused'" variant="outline" size="sm" @click="handleResume">
      <Icon name="lucide:play" class="size-4 mr-1" />
      Resume
    </Button>
  </div>
</template>
