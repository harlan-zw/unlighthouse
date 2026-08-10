<script setup lang="ts">
import type { Category, Device } from '@unlighthouse/contracts'
import type { UnlighthouseClient } from '@unlighthouse/contracts/client'
import type { PageLimitPreference } from '~/features/scan/recommendations'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { toast } from 'vue-sonner'
import { estimateScanDuration } from '~/features/scan/estimate'
import {
  effectivePageCount,

  RECOMMENDED_PAGE_LIMIT,
  recommendPageLimit,
} from '~/features/scan/recommendations'
import { useScanStore } from '~/stores/scan'
import { normalizeSiteUrl } from '~/utils/site-url'

const props = withDefaults(defineProps<{
  initialUrl?: string
  hideCancel?: boolean
  cancelTo?: string
  emphasis?: boolean
  focused?: boolean
}>(), {
  initialUrl: '',
  hideCancel: false,
  cancelTo: '/',
  emphasis: false,
  focused: false,
})

type ScanPreviewResult = Awaited<ReturnType<UnlighthouseClient['scan.preview']>>
type ReadyPreview = Extract<ScanPreviewResult, { status: 'ready' }>
type BlockedPreview = Extract<ScanPreviewResult, { status: 'blocked' }>
type PreviewState
  = | { _tag: 'Idle' }
    | { _tag: 'Checking' }
    | { _tag: 'Ready', result: ReadyPreview }
    | { _tag: 'Blocked', result: BlockedPreview }
    | { _tag: 'Unavailable' }

const router = useRouter()
const api = useApi()
const store = useScanStore()
const isStatic = useIsStatic()

const siteUrl = ref(props.initialUrl)
const siteUrlError = ref('')
const device = ref<Device | 'both'>('both')
const scanMode = ref<'site' | 'page'>('site')
const loading = ref(false)
const submitError = ref('')
const preview = ref<PreviewState>({ _tag: 'Idle' })
const pageLimit = ref<PageLimitPreference>({ _tag: 'Automatic', value: null })
let previewRequestId = 0

const scanModeOptions: Array<{
  value: 'site' | 'page'
  label: string
}> = [
  {
    value: 'site',
    label: 'Whole site',
  },
  {
    value: 'page',
    label: 'One page',
  },
]

const deviceOptions: Array<{ label: string, value: Device | 'both', icon: string }> = [
  { label: 'Mobile', value: 'mobile', icon: 'smartphone' },
  { label: 'Desktop', value: 'desktop', icon: 'monitor' },
  { label: 'Both', value: 'both', icon: 'layers' },
]

const advancedOpen = ref(false)
const sampleSize = ref<number>(1)
const sampleSizeOptions = [
  { label: '1 run (fastest)', value: '1' },
  { label: '3 runs (median)', value: '3' },
  { label: '5 runs (most stable)', value: '5' },
]
const categoryOptions = [
  { value: 'performance', label: 'Performance', icon: 'gauge' },
  { value: 'accessibility', label: 'Accessibility', icon: 'accessibility' },
  { value: 'seo', label: 'SEO', icon: 'search' },
  { value: 'best-practices', label: 'Best practices', icon: 'shield-check' },
  { value: 'agentic-browsing', label: 'Agentic browsing', icon: 'bot' },
] as const satisfies readonly { value: Category, label: string, icon: string }[]
const allCategories = categoryOptions.map(category => category.value)
const selectedCategories = ref<Category[]>([...allCategories])
const ciBranch = ref('')
const ciHash = ref('')
const ciMessage = ref('')

const normalizedUrl = computed(() => normalizeSiteUrl(siteUrl.value))
const estimatedUrlCount = computed(() => {
  if (!normalizedUrl.value)
    return null
  if (scanMode.value === 'page')
    return 1
  return preview.value._tag === 'Ready' ? preview.value.result.urlCount : null
})
const effectiveUrlCount = computed(() => {
  if (!estimatedUrlCount.value)
    return null
  if (scanMode.value === 'page')
    return 1
  return effectivePageCount(estimatedUrlCount.value, pageLimit.value)
})
const pageLimitValue = computed(() => pageLimit.value.value)
const showPageLimit = computed(() => scanMode.value === 'site' && pageLimitValue.value != null)
const recommendedPageLimitApplied = computed(() => pageLimit.value._tag === 'Automatic' && pageLimit.value.value === RECOMMENDED_PAGE_LIMIT)
const pageScopeSummary = computed(() => {
  if (!effectiveUrlCount.value)
    return ''
  if (scanMode.value === 'page')
    return '1 page'
  if (estimatedUrlCount.value && effectiveUrlCount.value < estimatedUrlCount.value)
    return `${effectiveUrlCount.value} of ${estimatedUrlCount.value} pages`
  return `${effectiveUrlCount.value} ${effectiveUrlCount.value === 1 ? 'page' : 'pages'}`
})
const scanEstimate = computed(() => {
  if (scanMode.value === 'page' || !effectiveUrlCount.value)
    return null
  return estimateScanDuration({
    urlCount: effectiveUrlCount.value,
    device: device.value,
    sampleSize: sampleSize.value,
    categories: selectedCategories.value,
  })
})
const previewFinished = computed(() => preview.value._tag === 'Ready' || preview.value._tag === 'Blocked' || preview.value._tag === 'Unavailable')
const scopeChecking = computed(() => preview.value._tag === 'Checking')
const canRunScan = computed(() => Boolean(normalizedUrl.value)
  && !loading.value
  && (scanMode.value === 'page' || previewFinished.value))

function validateSiteUrl(requireValue = false): boolean {
  if (!siteUrl.value.trim()) {
    siteUrlError.value = requireValue ? 'Enter a site URL to scan.' : ''
    return !requireValue
  }
  if (!normalizedUrl.value) {
    siteUrlError.value = 'Enter a valid web address, such as example.com.'
    return false
  }
  siteUrlError.value = ''
  return true
}

function focusActiveUrlInput() {
  document.getElementById(scanMode.value === 'site' ? 'site-url-site' : 'site-url-page')?.focus()
}

watch([siteUrl, scanMode], () => {
  previewRequestId += 1
  preview.value = { _tag: 'Idle' }
  siteUrlError.value = ''
  submitError.value = ''
  if (pageLimit.value._tag === 'Automatic')
    pageLimit.value = { _tag: 'Automatic', value: null }
})

function updatePageLimit(value: number | null) {
  if (value == null || !Number.isFinite(value))
    return
  pageLimit.value = { _tag: 'User', value: Math.max(1, Math.floor(value)) }
}

async function handleSiteUrlBlur() {
  const url = normalizedUrl.value
  if (!validateSiteUrl() || !url || scanMode.value !== 'site' || preview.value._tag !== 'Idle')
    return

  const requestId = ++previewRequestId
  preview.value = { _tag: 'Checking' }
  const result = await api['scan.preview']({ site: url, mode: 'site' }).catch((error: unknown) => {
    logOperationalWarn('ui.optional_api_read_failed', error, {
      command: 'scan.preview',
      feature: 'new-scan-form',
    }, console)
    return null
  })
  if (requestId !== previewRequestId)
    return
  if (result?.status === 'ready') {
    preview.value = { _tag: 'Ready', result }
    pageLimit.value = recommendPageLimit(result.urlCount, pageLimit.value)
  }
  else if (result?.status === 'blocked') {
    preview.value = { _tag: 'Blocked', result }
  }
  else {
    preview.value = { _tag: 'Unavailable' }
  }
}

async function handleSubmit() {
  submitError.value = ''
  if (!validateSiteUrl(true)) {
    await nextTick()
    focusActiveUrlInput()
    return
  }
  if (!canRunScan.value)
    return

  const url = normalizedUrl.value!
  const deviceValue: Device | [Device, ...Device[]] = device.value === 'both' ? ['mobile', 'desktop'] : device.value
  const ciBuild = (ciBranch.value || ciHash.value || ciMessage.value)
    ? {
        branch: ciBranch.value || undefined,
        hash: ciHash.value || undefined,
        message: ciMessage.value || undefined,
      }
    : undefined
  const categories = selectedCategories.value.length === allCategories.length
    ? undefined
    : selectedCategories.value

  loading.value = true
  try {
    const result = await store.startScan(url, {
      device: deviceValue,
      mode: scanMode.value,
      sampleSize: sampleSize.value > 1 ? sampleSize.value : undefined,
      maxRoutes: scanMode.value === 'site' ? pageLimitValue.value ?? undefined : undefined,
      categories,
      ciBuild,
    })
    toast.success('Scan started', { description: url })
    router.push(`/sites/${siteSlug(url)}/scans/${result.scanId}/overview`)
  }
  catch (error) {
    if (error instanceof Error && error.name === 'ACTIVE_SCAN_CONFLICT') {
      toast.error('Scan already running', { description: 'Open the active scan or cancel it before starting another.' })
      if (store.scanId)
        router.push(`/sites/${siteSlug(store.site || url)}/scans/${store.scanId}/overview`)
    }
    else {
      const message = normalizeApiError(error).message.replace(/[.\s]+$/, '')
      submitError.value = `${message}. Check the URL and retry.`
    }
  }
  finally {
    loading.value = false
  }
}
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

  <div v-else class="space-y-3">
    <UTabs
      v-model="scanMode"
      :items="scanModeOptions"
      :content="false"
      variant="link"
      color="primary"
      size="lg"
      aria-label="Audit scope"
      :ui="{
        root: 'w-full',
        list: 'w-full justify-start gap-8 border-0 bg-transparent p-0',
        trigger: 'min-h-11 flex-none rounded-none px-1',
      }"
    />

    <UiCard :size="focused ? 'md' : 'lg'" :emphasis="emphasis">
      <form :class="focused ? 'space-y-5' : 'space-y-6'" @submit.prevent="handleSubmit">
        <div v-if="scanMode === 'site'" class="space-y-4" role="tabpanel" aria-label="Whole site">
          <p v-if="!focused" class="text-sm leading-relaxed text-muted">
            Discover indexable URLs from the sitemap, then audit the site. Runtime grows with the number of pages.
          </p>
          <UFormField name="site-url-site" label="Site URL" required :error="siteUrlError || undefined">
            <UInput
              id="site-url-site"
              v-model="siteUrl"
              name="site-url-site"
              type="text"
              placeholder="example.com…"
              autocomplete="url"
              inputmode="url"
              enterkeyhint="go"
              autocapitalize="none"
              :spellcheck="false"
              aria-required="true"
              :aria-invalid="Boolean(siteUrlError)"
              class="w-full font-mono"
              :ui="{ base: 'min-h-11' }"
              @blur="handleSiteUrlBlur"
            />
            <template v-if="!focused" #help>
              Start at the homepage. Sitemaps provide the most reliable count.
            </template>
          </UFormField>

          <div
            v-if="scopeChecking || preview._tag !== 'Idle'"
            id="site-scope-status"
            :class="focused ? 'text-sm' : 'rounded-lg border border-default bg-elevated/45 px-3.5 py-3'"
            role="status"
            aria-live="polite"
          >
            <div v-if="scopeChecking" class="flex items-center gap-2 text-sm text-muted">
              <UiIcon name="loader" class="size-4 motion-safe:animate-spin" aria-hidden="true" />
              Checking site scope…
            </div>
            <template v-else-if="preview._tag === 'Ready'">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span class="font-medium text-highlighted">
                  <template v-if="preview.result.source === 'sitemap'">
                    {{ preview.result.urlCount }} likely indexable {{ preview.result.urlCount === 1 ? 'URL' : 'URLs' }}
                  </template>
                  <template v-else>
                    {{ preview.result.urlCount }} linked {{ preview.result.urlCount === 1 ? 'URL' : 'URLs' }}
                  </template>
                </span>
                <span class="text-muted">
                  {{ preview.result.source === 'sitemap' ? 'from sitemap' : 'from homepage' }}
                </span>
              </div>
              <p v-if="preview.result.warnings.includes('cloudflare-trap-links')" class="mt-1 text-sm leading-relaxed text-warning">
                Cloudflare trap links ignored.
              </p>
              <p v-else-if="!focused" class="mt-1 text-sm leading-relaxed text-muted">
                <template v-if="preview.result.source === 'sitemap'">
                  Sitemap count, high confidence.
                </template>
                <template v-else>
                  Homepage links, a lower-bound estimate.
                </template>
              </p>
              <p v-if="recommendedPageLimitApplied" class="mt-2 flex items-center gap-1.5 text-sm font-medium text-highlighted">
                <UiIcon name="check" class="size-4 text-success" aria-hidden="true" />
                Limited to 100 pages. Change in Advanced.
              </p>
            </template>
            <template v-else-if="preview._tag === 'Blocked'">
              <div class="text-sm font-medium text-highlighted">
                {{ preview.result.reason === 'rate-limited' ? 'Rate limit detected' : 'Cloudflare protection detected' }}
              </div>
              <p class="mt-1 text-sm leading-relaxed text-muted">
                <template v-if="preview.result.reason === 'rate-limited'">
                  The site asked discovery to slow down<span v-if="preview.result.retryAfterSeconds"> for about {{ preview.result.retryAfterSeconds }} seconds</span>. Scan settings still work.
                </template>
                <template v-else-if="preview.result.reason === 'cloudflare-trap'">
                  Cloudflare honeytrap links replaced the real navigation. Scan settings still work, but the URL count cannot be trusted.
                </template>
                <template v-else>
                  A managed challenge blocked discovery. Scan settings still work, but the URL count is unavailable.
                </template>
              </p>
            </template>
            <template v-else>
              <div class="text-sm font-medium text-highlighted">
                Estimate unavailable
              </div>
              <p class="mt-1 text-sm leading-relaxed text-muted">
                Scan settings still work. We will discover URLs when the scan starts.
              </p>
            </template>
          </div>
        </div>

        <div v-else class="space-y-4" role="tabpanel" aria-label="One page">
          <p v-if="!focused" class="text-sm leading-relaxed text-muted">
            Audit one exact URL. Best for checking a landing page or a change before release.
          </p>
          <UFormField name="site-url-page" label="Page URL" required :error="siteUrlError || undefined">
            <UInput
              id="site-url-page"
              v-model="siteUrl"
              name="site-url-page"
              type="text"
              placeholder="example.com/pricing…"
              autocomplete="url"
              inputmode="url"
              enterkeyhint="go"
              autocapitalize="none"
              :spellcheck="false"
              aria-required="true"
              :aria-invalid="Boolean(siteUrlError)"
              class="w-full font-mono"
              :ui="{ base: 'min-h-11' }"
              @blur="validateSiteUrl()"
            />
            <template v-if="!focused" #help>
              Only this page is audited. No sitemap or link discovery.
            </template>
          </UFormField>
        </div>

        <UFormField name="device" label="Device">
          <UiTogglePill
            v-model="device"
            :options="deviceOptions"
            label="Audit device"
            class="scan-device-toggle w-fit max-w-full"
          />
          <template v-if="!focused" #help>
            Both audits each URL with mobile and desktop profiles.
          </template>
        </UFormField>

        <div>
          <button
            type="button"
            class="group flex min-h-11 w-full items-center gap-2 text-sm font-medium text-muted hover:text-default"
            :aria-expanded="advancedOpen"
            aria-controls="scan-advanced-options"
            @click="advancedOpen = !advancedOpen"
          >
            <UiIcon name="chevron-right" class="size-4 transition-transform motion-reduce:transition-none" :class="{ 'rotate-90': advancedOpen }" aria-hidden="true" />
            Advanced
            <span v-if="pageLimit._tag === 'User' || sampleSize > 1 || selectedCategories.length < allCategories.length || ciBranch || ciHash" class="ml-auto text-sm text-highlighted">customized</span>
            <span v-else-if="recommendedPageLimitApplied" class="ml-auto text-sm text-highlighted">100 page limit</span>
          </button>

          <div
            v-show="advancedOpen"
            id="scan-advanced-options"
            class="flex flex-col gap-6"
            :class="focused ? 'pt-3' : 'pt-4 pl-6'"
          >
            <UFormField v-if="showPageLimit" name="max-routes" label="Page limit">
              <UInputNumber
                id="max-routes"
                :model-value="pageLimitValue"
                name="max-routes"
                aria-label="Maximum pages to audit"
                :min="1"
                :max="estimatedUrlCount || undefined"
                :step="10"
                :step-snapping="false"
                required
                class="w-full"
                :ui="{ base: 'min-h-11 font-mono' }"
                @update:model-value="updatePageLimit"
              />
              <template #help>
                {{ pageScopeSummary }} selected. Increase this for broader coverage or lower it for a faster scan.
              </template>
            </UFormField>

            <UFormField name="sample-size" label="Repeat runs">
              <USelect
                :model-value="String(sampleSize)"
                name="sample-size"
                aria-label="Repeat runs"
                :items="sampleSizeOptions"
                class="w-full"
                :ui="{ base: 'min-h-11' }"
                @update:model-value="(value) => sampleSize = Number(value)"
              />
              <template #help>
                {{ scanMode === 'site' ? 'Repeat runs multiply the work for every URL.' : 'Repeat this page to smooth noisy performance results.' }}
              </template>
            </UFormField>

            <fieldset class="space-y-2">
              <legend class="text-sm font-medium">
                Categories
              </legend>
              <div class="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <label
                  v-for="cat in categoryOptions"
                  :key="cat.value"
                  class="cursor-pointer"
                  :class="selectedCategories.length === 1 && selectedCategories.includes(cat.value) ? 'cursor-not-allowed opacity-70' : ''"
                >
                  <input
                    v-model="selectedCategories"
                    class="peer sr-only"
                    type="checkbox"
                    name="categories"
                    :value="cat.value"
                    :disabled="selectedCategories.length === 1 && selectedCategories.includes(cat.value)"
                  >
                  <span
                    class="flex min-h-11 items-center gap-2 rounded-md border border-default px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-elevated/50 peer-checked:border-accented peer-checked:bg-elevated peer-checked:text-highlighted peer-checked:ring-1 peer-checked:ring-default peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
                  >
                    <UiIcon :name="cat.icon" class="size-4 shrink-0" aria-hidden="true" />
                    <span>{{ cat.label }}</span>
                  </span>
                </label>
              </div>
              <p class="text-sm text-muted">
                Fewer categories reduce runtime. At least one must stay selected.
              </p>
            </fieldset>

            <div class="space-y-2">
              <div class="text-sm font-medium">
                CI build metadata
              </div>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <UFormField name="ci-branch" label="Branch">
                  <UInput id="ci-branch" v-model="ciBranch" name="ci-branch" placeholder="main" autocomplete="off" autocapitalize="none" :spellcheck="false" class="w-full font-mono text-sm" :ui="{ base: 'min-h-11' }" />
                </UFormField>
                <UFormField name="ci-hash" label="Commit hash">
                  <UInput id="ci-hash" v-model="ciHash" name="ci-hash" placeholder="a1b2c3d" autocomplete="off" autocapitalize="none" :spellcheck="false" class="w-full font-mono text-sm" :ui="{ base: 'min-h-11' }" />
                </UFormField>
              </div>
              <UFormField name="ci-message" label="Commit message" hint="optional">
                <UInput id="ci-message" v-model="ciMessage" name="ci-message" placeholder="Improve scan reporting" autocomplete="off" class="w-full text-sm" :ui="{ base: 'min-h-11' }" />
              </UFormField>
              <p class="text-sm text-muted">
                Pin this scan to a deploy for branch and commit comparisons.
              </p>
            </div>
          </div>
        </div>

        <UiAlert
          v-if="submitError"
          class="onboarding-scan-alert"
          status="error"
          title="Scan could not start"
          :description="submitError"
          dismissible
          @dismiss="submitError = ''"
        />

        <div
          v-if="scanEstimate"
          class="scan-estimate-summary relative overflow-hidden rounded-xl border border-accented bg-elevated px-4 py-3.5 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div class="flex items-start gap-3">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accented text-highlighted">
              <UiIcon name="timer" class="size-4.5" aria-hidden="true" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                Estimated scan time
              </p>
              <div class="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span class="font-mono text-xl font-semibold tracking-tight text-highlighted">{{ scanEstimate.label }}</span>
                <span class="text-sm font-medium text-default">{{ pageScopeSummary }}</span>
              </div>
              <p class="mt-1 text-xs leading-relaxed text-muted">
                {{ scanEstimate.factors.slice(1).join(' · ') }}. Actual time varies by page weight and machine capacity.
              </p>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
          <UiButton
            type="submit"
            purpose="cta"
            class="min-h-11! lg:min-h-11!"
            :loading="loading"
            :disabled="!canRunScan"
            :aria-busy="loading || scopeChecking"
            :aria-describedby="scanMode === 'site' && normalizedUrl ? 'site-scope-status' : undefined"
            :block="hideCancel"
          >
            {{ loading ? 'Starting scan…' : scopeChecking ? 'Checking site scope…' : 'Run scan' }}
          </UiButton>
          <UiButton v-if="!hideCancel" type="button" purpose="secondary" @click="router.push(cancelTo)">
            Cancel setup
          </UiButton>
        </div>
      </form>
    </UiCard>
  </div>
</template>
