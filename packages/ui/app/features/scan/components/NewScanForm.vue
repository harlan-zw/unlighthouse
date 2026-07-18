<script setup lang="ts">
import type { Category, Device } from '@unlighthouse/contracts'
import { toast } from 'vue-sonner'
import { useScanStore } from '~/stores/scan'
import { normalizeSiteUrl } from '~/utils/site-url'

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
const isStatic = useIsStatic()

const siteUrl = ref(props.initialUrl)
const siteUrlError = ref('')
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

async function handleSubmit() {
  if (!siteUrl.value.trim())
    return

  const url = normalizeSiteUrl(siteUrl.value)
  if (!url) {
    siteUrlError.value = 'Enter a valid web address, such as example.com.'
    await nextTick()
    document.getElementById('site-url')?.focus()
    return
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
      toast.error('Scan already running', { description: 'Open the active scan or cancel it before starting another.' })
      if (store.scanId) {
        router.push(`/sites/${siteSlug(store.site || url)}/scans/${store.scanId}/overview`)
      }
    }
    else {
      toast.error('Scan failed to start', { description: `${err instanceof Error ? err.message : String(err)}. Check the URL and retry.` })
    }
  }
  finally {
    loading.value = false
  }
}

watch(siteUrl, () => {
  siteUrlError.value = ''
})
</script>

<template>
  <UiEmptyState
    v-if="isStatic"
    icon="archive"
    title="Scanning is unavailable in an offline report."
    description="Open a live Unlighthouse dashboard to start another scan."
  >
    <UiButton purpose="secondary" to="/">
      View report
    </UiButton>
  </UiEmptyState>
  <UiCard v-else>
    <form class="space-y-6" @submit.prevent="handleSubmit">
      <UFormField name="site-url" label="Site URL" required :error="siteUrlError || undefined">
        <UInput
          id="site-url"
          v-model="siteUrl"
          name="site-url"
          type="text"
          placeholder="example.com…"
          autocomplete="url"
          inputmode="url"
          enterkeyhint="go"
          autocapitalize="none"
          :spellcheck="false"
          required
          class="w-full font-mono"
          :ui="{ base: 'min-h-11 lg:min-h-8' }"
        />
        <template #help>
          {{ scanMode === 'site' ? 'All pages will be discovered via sitemap and crawling.' : 'Only this single URL will be audited.' }}
        </template>
      </UFormField>

      <fieldset class="space-y-2">
        <legend class="text-sm font-medium">
          Scan mode
        </legend>
        <div class="grid grid-cols-2 gap-2">
          <label v-for="option in [{ value: 'site', label: 'Full site', description: 'Crawl all pages', icon: 'globe' }, { value: 'page', label: 'Single page', description: 'Audit one URL only', icon: 'file' }] as const" :key="option.value" class="cursor-pointer">
            <input v-model="scanMode" class="peer sr-only" type="radio" name="scan-mode" :value="option.value">
            <span
              class="block rounded-lg border p-3 text-left transition-colors hover:bg-elevated/50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
              :class="scanMode === option.value ? 'border-accented bg-elevated ring-1 ring-default text-highlighted' : ''"
            >
              <span class="flex items-center gap-2 text-sm font-medium">
                <UiIcon :name="option.icon" class="size-4" />
                {{ option.label }}
              </span>
              <span class="mt-1 block text-sm text-muted">{{ option.description }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <UFormField name="device" label="Device">
        <USelect
          v-model="device"
          name="device"
          aria-label="Device"
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
          class="flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-default group w-full lg:min-h-6"
          :aria-expanded="advancedOpen"
          aria-controls="scan-advanced-options"
          @click="advancedOpen = !advancedOpen"
        >
          <UiIcon name="chevron-right" class="size-4 transition-transform" :class="{ 'rotate-90': advancedOpen }" />
          Advanced
          <span v-if="sampleSize > 1 || selectedCategories.length < allCategories.length || ciBranch || ciHash" class="ml-auto text-label text-highlighted">customized</span>
        </button>
        <div v-show="advancedOpen" id="scan-advanced-options" class="space-y-6 pt-4 pl-6">
          <UFormField name="sample-size" label="Sample size">
            <USelect
              :model-value="String(sampleSize)"
              name="sample-size"
              aria-label="Sample size"
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

          <fieldset class="space-y-2">
            <legend class="text-sm font-medium">
              Categories
            </legend>
            <div class="grid grid-cols-2 gap-2">
              <label
                v-for="cat in allCategories"
                :key="cat"
                class="cursor-pointer"
                :class="selectedCategories.length === 1 && selectedCategories.includes(cat) ? 'cursor-not-allowed opacity-70' : ''"
              >
                <input
                  v-model="selectedCategories"
                  class="peer sr-only"
                  type="checkbox"
                  name="categories"
                  :value="cat"
                  :disabled="selectedCategories.length === 1 && selectedCategories.includes(cat)"
                >
                <span
                  class="block min-h-11 rounded-md border px-3 py-2 text-left text-xs capitalize transition-colors hover:bg-elevated/50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  :class="selectedCategories.includes(cat) ? 'border-accented bg-elevated ring-1 ring-default text-highlighted' : 'text-muted'"
                >{{ cat.replace('-', ' ') }}</span>
              </label>
            </div>
            <p class="text-sm text-muted">
              Skipping categories cuts audit time. At least one must stay selected.
            </p>
          </fieldset>

          <div class="space-y-2">
            <div class="text-sm font-medium">
              CI build metadata
            </div>
            <div class="grid grid-cols-2 gap-2">
              <UFormField name="ci-branch" label="Branch">
                <UInput id="ci-branch" v-model="ciBranch" name="ci-branch" placeholder="main" autocomplete="off" autocapitalize="none" :spellcheck="false" class="font-mono text-xs" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
              </UFormField>
              <UFormField name="ci-hash" label="Commit hash">
                <UInput id="ci-hash" v-model="ciHash" name="ci-hash" placeholder="a1b2c3d" autocomplete="off" autocapitalize="none" :spellcheck="false" class="font-mono text-xs" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
              </UFormField>
            </div>
            <UFormField name="ci-message" label="Commit message" hint="optional">
              <UInput id="ci-message" v-model="ciMessage" name="ci-message" placeholder="Improve scan reporting" autocomplete="off" class="w-full text-xs" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
            </UFormField>
            <p class="text-sm text-muted">
              Pin this scan to a deploy. Compare against previous scans on the same branch via the compare page.
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 pt-2">
        <UiButton type="submit" purpose="cta" :loading="loading" :disabled="loading" icon="radar" class="flex-1 sm:flex-none">
          Run scan
        </UiButton>
        <UiButton v-if="!hideCancel" type="button" purpose="secondary" @click="router.push(cancelTo)">
          Cancel setup
        </UiButton>
      </div>
    </form>
  </UiCard>
</template>
