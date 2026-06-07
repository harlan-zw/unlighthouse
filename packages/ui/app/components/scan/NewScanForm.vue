<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useScanStore } from '~/stores/scan'

// The new-scan form, extracted so both /scan/new and /onboarding can reuse
// it. Owns the whole submit lifecycle (store.startScan + toast + navigation)
// so the post-scan redirect lives in exactly one place.
const props = withDefaults(defineProps<{
  initialUrl?: string
  hideCancel?: boolean
  cancelTo?: string
}>(), {
  initialUrl: '',
  hideCancel: false,
  cancelTo: '/',
})

const router = useRouter()
const api = useApi()
const store = useScanStore()

const siteUrl = ref(props.initialUrl)
const device = ref('mobile')
const scanMode = ref<'site' | 'page'>('site')
const loading = ref(false)

// Advanced section — mirrors the scan.start contract so power users can
// shape the run without dropping to the CLI:
//
//   sampleSize: Lighthouse runs N times per URL and takes the median. 1
//   is the fastest + default; 3 smooths out noisy CWV numbers; 5 is the
//   contract max (we cap the UI lower than the contract's 10 because
//   the dashboard is for ad-hoc audits, not benchmark suites).
//
//   categories: subset of `performance | accessibility | seo |
//   best-practices`. Empty = run all four. Selecting a subset cuts audit
//   time roughly proportional to the omitted categories.
//
//   ciBuild: the only reason to fill this from the dashboard is when
//   you're scanning a deploy preview and want comparisons to bucket by
//   commit. Branch alone is enough for compare.findPrevious to work.
const advancedOpen = ref(false)
const sampleSize = ref<number>(1)
const allCategories = ['performance', 'accessibility', 'seo', 'best-practices'] as const
const selectedCategories = ref<string[]>([...allCategories])
const ciBranch = ref('')
const ciHash = ref('')
const ciMessage = ref('')

// Select option arrays for USelect (label/value pairs). sampleSize is
// stored as a number but USelect items use string values, so a computed
// proxy bridges the v-model below.
const deviceItems = [
  { label: 'Mobile', value: 'mobile' },
  { label: 'Desktop', value: 'desktop' },
  { label: 'Both', value: 'both' },
]
const sampleSizeItems = [
  { label: '1 run (fastest)', value: '1' },
  { label: '3 runs (median)', value: '3' },
  { label: '5 runs (most stable)', value: '5' },
]
const sampleSizeStr = computed({
  get: () => String(sampleSize.value),
  set: (v: string) => { sampleSize.value = Number(v) },
})

function toggleCategory(cat: string) {
  const i = selectedCategories.value.indexOf(cat)
  if (i >= 0) {
    if (selectedCategories.value.length > 1)
      selectedCategories.value.splice(i, 1)
  }
  else {
    selectedCategories.value.push(cat)
  }
}

async function handleSubmit() {
  if (!siteUrl.value.trim())
    return

  let url = siteUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  const deviceValue = device.value === 'both' ? ['mobile', 'desktop'] : device.value

  // Only forward ciBuild when at least one field is set — otherwise an
  // empty object pins ciBranch=null on the scan row and breaks the
  // git-fallback that resolveConfig does for local CLI runs.
  const ciBuild = (ciBranch.value || ciHash.value || ciMessage.value)
    ? {
        branch: ciBranch.value || undefined,
        hash: ciHash.value || undefined,
        message: ciMessage.value || undefined,
      }
    : undefined

  // Only send `categories` when the user actually narrowed the set —
  // sending all four is equivalent to omitting but adds noise to the
  // scan record's options column.
  const categories = selectedCategories.value.length === allCategories.length
    ? undefined
    : selectedCategories.value

  loading.value = true
  try {
    const result = await store.startScan(api, url, {
      device: deviceValue as any,
      mode: scanMode.value,
      sampleSize: sampleSize.value > 1 ? sampleSize.value : undefined,
      categories,
      ciBuild,
    })
    toast.success('Scan started', { description: url })
    router.push(`/sites/${siteSlug(url)}/scans/${result.scanId}/routes`)
  }
  catch (err: any) {
    if (err.name === 'ACTIVE_SCAN_CONFLICT') {
      toast.error('A scan is already running')
      if (store.scanId) {
        router.push(`/sites/${siteSlug(store.site || url)}/scans/${store.scanId}/routes`)
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
  <UCard>
    <form class="space-y-5" @submit.prevent="handleSubmit">
      <div class="space-y-2">
        <label class="text-sm font-medium" for="site-url">Site URL</label>
        <UInput
          id="site-url"
          v-model="siteUrl"
          placeholder="https://example.com"
          required
          autofocus
          class="w-full font-mono"
        />
        <p class="text-xs text-muted">
          {{ scanMode === 'site' ? 'All pages will be discovered via sitemap and crawling.' : 'Only this single URL will be audited.' }}
        </p>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium">Scan Mode</label>
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
            <p class="text-[11px] text-muted mt-1">Crawl all pages</p>
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
            <p class="text-[11px] text-muted mt-1">Audit one URL only</p>
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium" for="device">Device</label>
        <USelect id="device" v-model="device" :items="deviceItems" class="w-full" />
      </div>

      <UCollapsible v-model:open="advancedOpen">
        <button type="button" class="flex items-center gap-2 text-sm font-medium text-muted hover:text-highlighted group w-full">
          <Icon name="lucide:chevron-right" class="size-4 transition-transform" :class="{ 'rotate-90': advancedOpen }" />
          Advanced
          <span v-if="sampleSize > 1 || selectedCategories.length < allCategories.length || ciBranch || ciHash" class="ml-auto text-[10px] uppercase tracking-wider text-primary">customized</span>
        </button>
        <template #content>
          <div class="space-y-5 pt-4 pl-6">
            <div class="space-y-2">
              <label class="text-sm font-medium" for="sample-size">Sample size</label>
              <USelect id="sample-size" v-model="sampleSizeStr" :items="sampleSizeItems" class="w-full" />
              <p class="text-[11px] text-muted">
                Lighthouse runs N times per URL and takes the median. Higher = more stable CWV but ~Nx slower.
              </p>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium">Categories</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="cat in allCategories"
                  :key="cat"
                  type="button"
                  class="rounded-md border px-3 py-2 text-xs text-left transition-all capitalize"
                  :class="selectedCategories.includes(cat) ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50 text-muted'"
                  @click="toggleCategory(cat)"
                >
                  {{ cat.replace('-', ' ') }}
                </button>
              </div>
              <p class="text-[11px] text-muted">
                Skipping categories cuts audit time. At least one must stay selected.
              </p>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium">CI build metadata</label>
              <div class="grid grid-cols-2 gap-2">
                <UInput v-model="ciBranch" placeholder="branch" class="w-full font-mono text-xs" />
                <UInput v-model="ciHash" placeholder="commit hash" class="w-full font-mono text-xs" />
              </div>
              <UInput v-model="ciMessage" placeholder="commit message (optional)" class="w-full text-xs" />
              <p class="text-[11px] text-muted">
                Pin this scan to a deploy. Compare against previous scans on the same branch via the compare page.
              </p>
            </div>
          </div>
        </template>
      </UCollapsible>

      <div class="flex items-center gap-3 pt-2">
        <UButton type="submit" :loading="loading" :disabled="loading || !siteUrl.trim()" class="flex-1 sm:flex-none">
          <Icon v-if="!loading" name="lucide:radar" class="size-4 mr-2" />
          Start Scan
        </UButton>
        <UButton v-if="!hideCancel" type="button" color="neutral" variant="outline" @click="router.push(cancelTo)">
          Cancel
        </UButton>
      </div>
    </form>
  </UCard>
</template>
