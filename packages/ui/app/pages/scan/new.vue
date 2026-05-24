<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'vue-sonner'

const siteUrl = ref('')
const device = ref('mobile')
const loading = ref(false)

import { useScanStore } from '~/stores/scan'

const router = useRouter()
const api = useApi()
const store = useScanStore()

async function handleSubmit() {
  if (!siteUrl.value.trim()) return

  let url = siteUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  loading.value = true
  try {
    const result = await store.startScan(api, url, { device: device.value })
    toast.success('Scan started', { description: url })
    router.push(`/scan/${result.scanId}/overview`)
  }
  catch (err: any) {
    if (err.name === 'ACTIVE_SCAN_CONFLICT') {
      toast.error('A scan is already running')
      if (store.scanId) {
        router.push(`/scan/${store.scanId}/overview`)
      }
    }
    else {
      toast.error('Failed to start scan', { description: err.message })
    }
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">
        New Scan
      </h1>
      <p class="text-muted-foreground">
        Enter a website URL to start a Lighthouse scan.
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <form class="space-y-6" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="site-url">Site URL</Label>
            <Input
              id="site-url"
              v-model="siteUrl"
              placeholder="https://example.com"
              required
              autofocus
            />
          </div>

          <div class="space-y-2">
            <Label for="device">Device</Label>
            <Select v-model="device">
              <SelectTrigger id="device" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile">
                  Mobile
                </SelectItem>
                <SelectItem value="desktop">
                  Desktop
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <Button type="submit" :disabled="loading || !siteUrl.trim()">
              <Icon v-if="loading" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:scan" class="size-4 mr-2" />
              Start Scan
            </Button>
            <Button type="button" variant="outline" @click="router.push('/')">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
