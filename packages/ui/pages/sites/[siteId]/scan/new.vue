<script setup lang="ts">
import { useSites } from '~/composables/sites'
import { useApiClient } from '~/composables/useApiClient'

definePageMeta({ layout: 'site' })

const route = useRoute()
const toast = useToast()
const client = useApiClient()
const { getSite } = useSites()
const site = getSite(route.params.siteId as string)

const form = reactive({
  device: site.value?.device ?? 'mobile' as 'mobile' | 'desktop',
  throttle: true,
  sampleSize: 0,
  categories: ['performance', 'accessibility', 'best-practices', 'seo'],
})

const submitting = ref(false)

const sampleSizeOptions = [
  { label: '10 routes', value: 10 },
  { label: '50 routes', value: 50 },
  { label: '100 routes', value: 100 },
  { label: 'Unlimited', value: 0 },
]
const categoryOptions = [
  { label: 'Performance', value: 'performance', icon: 'i-heroicons-bolt' },
  { label: 'Accessibility', value: 'accessibility', icon: 'i-heroicons-eye' },
  { label: 'Best Practices', value: 'best-practices', icon: 'i-heroicons-shield-check' },
  { label: 'SEO', value: 'seo', icon: 'i-heroicons-magnifying-glass' },
]

function toggleCategory(v: string) {
  const i = form.categories.indexOf(v)
  if (i === -1)
    form.categories.push(v)
  else if (form.categories.length > 1)
    form.categories.splice(i, 1)
}

async function start() {
  if (!site.value)
    return
  submitting.value = true
  const input: Parameters<typeof client['scan.start']>[0] = {
    site: site.value.url,
    device: form.device,
  }
  if (form.sampleSize > 0)
    input.sampleSize = form.sampleSize
  if (form.categories.length < 4)
    input.categories = form.categories as Parameters<typeof client['scan.start']>[0]['categories']

  const result = await client['scan.start'](input).catch((err: unknown) => {
    const error = err as { name?: string, status?: number, message?: string }
    const isConflict = error.name === 'ACTIVE_SCAN_CONFLICT' || error.status === 409
    toast.add({
      title: isConflict ? 'Scan already running' : 'Could not start scan',
      description: error.message,
      color: isConflict ? 'warning' : 'error',
    })
    submitting.value = false
    return null
  })
  if (result?.scanId)
    navigateTo(`/results/${result.scanId}/scan`)
}
</script>

<template>
  <div v-if="site" class="max-w-2xl mx-auto">
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-highlighted">
        Run a scan
      </h1>
      <p class="text-sm text-muted mt-1 font-mono">
        {{ site.url }}
      </p>
    </header>

    <form class="space-y-6 rounded-sm ring-1 ring-default bg-elevated/40 p-6" @submit.prevent="start">
      <UFormField label="Device">
        <div class="flex gap-2">
          <!-- migrated: review purpose -->
          <UiButton
            v-for="d in ['mobile', 'desktop'] as const"
            :key="d"
            type="button"
            purpose="secondary"
            :icon="d === 'mobile' ? 'i-heroicons-device-phone-mobile' : 'i-heroicons-computer-desktop'"
            class="capitalize"
            @click="form.device = d"
          >
            {{ d }}
          </UiButton>
        </div>
      </UFormField>

      <UFormField>
        <div class="flex items-center justify-between rounded-sm ring-1 ring-default bg-elevated/40 p-4">
          <div>
            <div class="font-medium">
              Network throttling
            </div>
            <div class="text-sm text-dimmed">
              Simulate slower network conditions
            </div>
          </div>
          <USwitch v-model="form.throttle" />
        </div>
      </UFormField>

      <UFormField label="Sample size">
        <div class="grid grid-cols-4 gap-2">
          <!-- migrated: review purpose -->
          <UiButton
            v-for="o in sampleSizeOptions"
            :key="o.value"
            type="button"
            purpose="secondary"
            size="sm"
            @click="form.sampleSize = o.value"
          >
            {{ o.label }}
          </UiButton>
        </div>
      </UFormField>

      <UFormField label="Categories">
        <div class="grid grid-cols-2 gap-2">
          <!-- migrated: review purpose -->
          <UiButton
            v-for="c in categoryOptions"
            :key="c.value"
            type="button"
            purpose="secondary"
            :icon="c.icon"
            @click="toggleCategory(c.value)"
          >
            {{ c.label }}
          </UiButton>
        </div>
      </UFormField>

      <div class="flex items-center justify-end gap-3 pt-2">
        <UiButton purpose="quiet" :to="`/sites/${site.id}`">
          Cancel
        </UiButton>
        <UiButton type="submit" intensity="cta" purpose="cta" :loading="submitting" icon="i-heroicons-bolt">
          Start scan
        </UiButton>
      </div>
    </form>
  </div>
</template>
