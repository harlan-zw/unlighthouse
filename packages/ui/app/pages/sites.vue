<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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

const api = useApi()
const router = useRouter()

const { data: sitesData, refresh } = useAsyncData(
  'sites-list',
  () => api['sites.list']({}).catch(() => ({ sites: [] })),
)

const addOpen = ref(false)
const newUrl = ref('')
const newDevice = ref('mobile')
const adding = ref(false)

async function addSite() {
  if (!newUrl.value.trim()) return
  let url = newUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`

  adding.value = true
  try {
    await api['sites.create']({ url, device: newDevice.value as any })
    toast.success('Site added')
    addOpen.value = false
    newUrl.value = ''
    refresh()
  }
  catch (err: any) {
    toast.error('Failed to add site', { description: err.message })
  }
  finally {
    adding.value = false
  }
}

async function deleteSite(id: string) {
  try {
    await api['sites.delete']({ id })
    toast.success('Site removed')
    refresh()
  }
  catch (err: any) {
    toast.error('Failed to delete', { description: err.message })
  }
}

function scanSite(url: string) {
  router.push({ path: '/scan/new', query: { url } })
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Sites</h1>
        <p class="text-sm text-muted-foreground">Manage your monitored websites.</p>
      </div>
      <Dialog v-model:open="addOpen">
        <DialogTrigger as-child>
          <Button>
            <Icon name="lucide:plus" class="size-4 mr-2" />
            Add Site
          </Button>
        </DialogTrigger>
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Site</DialogTitle>
          </DialogHeader>
          <form class="space-y-4" @submit.prevent="addSite">
            <div class="space-y-2">
              <Label>URL</Label>
              <Input v-model="newUrl" placeholder="https://example.com" required class="font-mono" />
            </div>
            <div class="space-y-2">
              <Label>Default Device</Label>
              <Select v-model="newDevice">
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mobile">Mobile</SelectItem>
                  <SelectItem value="desktop">Desktop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" :disabled="adding || !newUrl.trim()">
                <Icon v-if="adding" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>

    <div v-if="!sitesData?.sites?.length" class="flex flex-col items-center justify-center py-16 text-center">
      <Icon name="lucide:globe" class="size-12 text-muted-foreground/50 mb-4" />
      <p class="text-muted-foreground">No sites registered yet.</p>
      <p class="text-xs text-muted-foreground mt-1">Sites are automatically added when you run a scan.</p>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card v-for="site in sitesData.sites" :key="site.id">
        <CardContent class="pt-5 pb-4">
          <div class="flex items-start justify-between mb-3">
            <div class="min-w-0 flex-1">
              <div class="font-medium text-sm truncate">{{ site.name }}</div>
              <div class="text-xs text-muted-foreground font-mono truncate mt-0.5">{{ site.url }}</div>
            </div>
            <Badge variant="outline" class="text-[10px] shrink-0 ml-2">{{ site.device }}</Badge>
          </div>
          <div class="text-xs text-muted-foreground mb-3">
            Added {{ new Date(site.createdAt).toLocaleDateString() }}
            <span v-if="site.group"> · {{ site.group }}</span>
          </div>
          <div class="flex items-center gap-2">
            <Button size="sm" variant="outline" class="flex-1" @click="scanSite(site.url)">
              <Icon name="lucide:radar" class="size-3.5 mr-1" />
              Scan
            </Button>
            <AlertDialog>
              <AlertDialogTrigger as-child>
                <Button size="sm" variant="ghost" class="text-muted-foreground hover:text-destructive">
                  <Icon name="lucide:trash-2" class="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove site?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes {{ site.name }} from the registry. Scan history will be preserved.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction @click="deleteSite(site.id)">Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
