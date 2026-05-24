<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'vue-sonner'
import { useScanStore } from '~/stores/scan'

const route = useRoute()
const router = useRouter()
const api = useApi()
const store = useScanStore()

const siteUrl = ref((route.query.url as string) || '')
const device = ref('mobile')
const scanMode = ref<'site' | 'page'>('site')
const loading = ref(false)

async function handleSubmit() {
  if (!siteUrl.value.trim()) return

  let url = siteUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  loading.value = true
  try {
    const result = await store.startScan(api, url, { device: device.value, mode: scanMode.value })
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
      <h1 class="text-2xl font-bold tracking-tight">New Scan</h1>
      <p class="text-sm text-muted-foreground">Enter a website URL to start a Lighthouse audit.</p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <form class="space-y-5" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="site-url">Site URL</Label>
            <Input
              id="site-url"
              v-model="siteUrl"
              placeholder="https://example.com"
              required
              autofocus
              class="font-mono"
            />
            <p class="text-xs text-muted-foreground">
              {{ scanMode === 'site' ? 'All pages will be discovered via sitemap and crawling.' : 'Only this single URL will be audited.' }}
            </p>
          </div>

          <div class="space-y-2">
            <Label>Scan Mode</Label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-lg border p-3 text-left transition-all"
                :class="scanMode === 'site' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'"
                @click="scanMode = 'site'"
              >
                <div class="flex items-center gap-2 text-sm font-medium">
                  <Icon name="lucide:globe" class="size-4" />
                  Full Site
                </div>
                <p class="text-[11px] text-muted-foreground mt-1">Crawl all pages</p>
              </button>
              <button
                type="button"
                class="rounded-lg border p-3 text-left transition-all"
                :class="scanMode === 'page' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'"
                @click="scanMode = 'page'"
              >
                <div class="flex items-center gap-2 text-sm font-medium">
                  <Icon name="lucide:file" class="size-4" />
                  Single Page
                </div>
                <p class="text-[11px] text-muted-foreground mt-1">Audit one URL only</p>
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="device">Device</Label>
            <Select v-model="device">
              <SelectTrigger id="device" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile">
                  <div class="flex items-center gap-2">
                    <Icon name="lucide:smartphone" class="size-4" />
                    Mobile
                  </div>
                </SelectItem>
                <SelectItem value="desktop">
                  <div class="flex items-center gap-2">
                    <Icon name="lucide:monitor" class="size-4" />
                    Desktop
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <Button type="submit" :disabled="loading || !siteUrl.trim()" class="flex-1 sm:flex-none">
              <Icon v-if="loading" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:radar" class="size-4 mr-2" />
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
