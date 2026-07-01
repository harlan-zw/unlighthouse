<script setup lang="ts">
import type { Category, Device } from '@unlighthouse/contracts'
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
const store = useScanStore()

const siteUrl = ref(props.initialUrl)
// Default to a mobile+desktop matrix scan so every route is captured on both
// form factors (the route detail + screenshots aren't stuck on mobile-only).
const device = ref<Device | 'both'>('both')
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
  //   best-practices | agentic-browsing`. Empty = run all default
  //   Lighthouse categories. Selecting a subset cuts audit
//   time roughly proportional to the omitted categories.
//
//   ciBuild: the only reason to fill this from the dashboard is when
//   you're scanning a deploy preview and want comparisons to bucket by
//   commit. Branch alone is enough for compare.findPrevious to work.
const advancedOpen = ref(false)
const sampleSize = ref<number>(1)
const allCategories = ['performance', 'accessibility', 'seo', 'best-practices', 'agentic-browsing'] as const satisfies readonly Category[]
const selectedCategories = ref<Category[]>([...allCategories])
const ciBranch = ref('')
const ciHash = ref('')
const ciMessage = ref('')

function toggleCategory(cat: Category) {
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

  const deviceValue: Device | [Device, ...Device[]] = device.value === 'both' ? ['mobile', 'desktop'] : device.value

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
  // sending all defaults is equivalent to omitting but adds noise to the
  // scan record's options column.
  const categories = selectedCategories.value.length === allCategories.length
    ? undefined
    : selectedCategories.value

  loading.value = true
  try {
    const result = await store.startScan(url, {
      device: deviceValue,
      mode: scanMode.value,
      sampleSize: sampleSize.value > 1 ? sampleSize.value : undefined,
      categories,
      ciBuild,
    })
    toast.success('Scan started', { description: url })
    // Land on the scan overview — that's where ScanProgress (live terminal)
    // + LiveResults render while the scan is running. /routes only shows the
    // (empty until done) results table, not the live progress.
    router.push(`/sites/${siteSlug(url)}/scans/${result.scanId}/overview`)
  }
  catch (err) {
    if (err instanceof Error && err.name === 'ACTIVE_SCAN_CONFLICT') {
      toast.error('A scan is already running')
      if (store.scanId) {
        router.push(`/sites/${siteSlug(store.site || url)}/scans/${store.scanId}/overview`)
      }
    }
    else {
      toast.error('Failed to start scan', { description: err instanceof Error ? err.message : String(err) })
    }
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UiCard>
    <form class="space-y-5" @submit.prevent="handleSubmit">
      <UFormField label="Site URL">
        <UInput
          id="site-url"
          v-model="siteUrl"
          placeholder="https://example.com"
          aria-label="Site URL"
          required
          autofocus
          class="w-full font-mono"
          :ui="{ base: 'min-h-11 lg:min-h-8' }"
        />
        <template #help>
          {{ scanMode === 'site' ? 'All pages will be discovered via sitemap and crawling.' : 'Only this single URL will be audited.' }}
        </template>
      </UFormField>

      <div class="space-y-2">
        <div class="text-sm font-medium">
          Scan Mode
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-lg border p-3 text-left transition-all"
            :class="scanMode === 'site' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-elevated/50'"
            @click="scanMode = 'site'"
          >
            <div class="flex items-center gap-2 text-sm font-medium">
              <UiIcon name="globe" class="size-4" />
              Full Site
            </div>
            <p class="text-[11px] text-muted mt-1">
              Crawl all pages
            </p>
          </button>
          <button
            type="button"
            class="rounded-lg border p-3 text-left transition-all"
            :class="scanMode === 'page' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-elevated/50'"
            @click="scanMode = 'page'"
          >
            <div class="flex items-center gap-2 text-sm font-medium">
              <UiIcon name="file" class="size-4" />
              Single Page
            </div>
            <p class="text-[11px] text-muted mt-1">
              Audit one URL only
            </p>
          </button>
        </div>
      </div>

      <UFormField label="Device">
        <USelect
          v-model="device"
          :items="[
            { label: 'Mobile', value: 'mobile', icon: 'smartphone' },
            { label: 'Desktop', value: 'desktop', icon: 'monitor' },
            { label: 'Both', value: 'both', icon: 'smartphone' },
          ]"
          class="w-full"
          :ui="{ base: 'min-h-11 lg:min-h-8' }"
        />
      </UFormField>

      <div>
        <button
          type="button"
          class="flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-default group w-full lg:min-h-0"
          @click="advancedOpen = !advancedOpen"
        >
          <UiIcon name="chevron-right" class="size-4 transition-transform" :class="{ 'rotate-90': advancedOpen }" />
          Advanced
          <span v-if="sampleSize > 1 || selectedCategories.length < allCategories.length || ciBranch || ciHash" class="ml-auto text-label text-primary">customized</span>
        </button>
        <div v-show="advancedOpen" class="space-y-5 pt-4 pl-6">
          <UFormField label="Sample size">
            <USelect
              :model-value="String(sampleSize)"
              :items="[
                { label: '1 run (fastest)', value: '1' },
                { label: '3 runs (median)', value: '3' },
                { label: '5 runs (most stable)', value: '5' },
              ]"
              class="w-full"
              :ui="{ base: 'min-h-11 lg:min-h-8' }"
              @update:model-value="(v) => sampleSize = Number(v)"
            />
            <template #help>
              Lighthouse runs N times per URL and takes the median. Higher = more stable CWV but ~Nx slower.
            </template>
          </UFormField>

          <div class="space-y-2">
            <div class="text-sm font-medium">
              Categories
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="cat in allCategories"
                :key="cat"
                type="button"
                class="rounded-md border px-3 py-2 text-xs text-left transition-all capitalize"
                :class="selectedCategories.includes(cat) ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-elevated/50 text-muted'"
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
            <div class="text-sm font-medium">
              CI build metadata
            </div>
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model="ciBranch" placeholder="branch" aria-label="CI branch" class="font-mono text-xs" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
              <UInput v-model="ciHash" placeholder="commit hash" aria-label="CI commit hash" class="font-mono text-xs" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
            </div>
            <UInput v-model="ciMessage" placeholder="commit message (optional)" aria-label="CI commit message" class="w-full text-xs" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
            <p class="text-[11px] text-muted">
              Pin this scan to a deploy. Compare against previous scans on the same branch via the compare page.
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 pt-2">
        <UiButton type="submit" purpose="cta" :loading="loading" :disabled="loading || !siteUrl.trim()" icon="radar" class="flex-1 sm:flex-none">
          Start Scan
        </UiButton>
        <UiButton v-if="!hideCancel" type="button" purpose="secondary" @click="router.push(cancelTo)">
          Cancel
        </UiButton>
      </div>
    </form>
  </UiCard>
</template>
