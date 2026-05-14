<script setup lang="ts">
import { useSites } from '~/composables/sites'

definePageMeta({ layout: 'dashboard' })

const { groups, addSite } = useSites()
const toast = useToast()

const form = reactive({
  url: '',
  name: '',
  group: null as string | null,
  device: 'mobile' as 'mobile' | 'desktop',
  scanNow: false,
})

const urlError = ref('')

function normalizeUrl(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`
}

function validate() {
  if (!form.url.trim()) {
    urlError.value = 'URL is required'
    return false
  }
  try {
    new URL(normalizeUrl(form.url))
    urlError.value = ''
    return true
  }
  catch {
    urlError.value = 'Invalid URL'
    return false
  }
}

const submitting = ref(false)

async function submit() {
  if (!validate())
    return
  submitting.value = true
  const site = await addSite({
    name: form.name.trim() || undefined,
    url: normalizeUrl(form.url),
    group: form.group,
    device: form.device,
  }).catch((err: Error) => {
    toast.add({ title: 'Could not add site', description: err.message, color: 'error' })
    submitting.value = false
    return null
  })
  if (!site)
    return
  toast.add({ title: 'Site added', description: site.name, color: 'success' })
  navigateTo(form.scanNow ? `/sites/${site.id}/scan/new` : `/sites/${site.id}`)
}

const devices = [
  { id: 'mobile' as const, label: 'Mobile', hint: 'Slow 4G, Moto G Power', icon: 'i-heroicons-device-phone-mobile' },
  { id: 'desktop' as const, label: 'Desktop', hint: 'Cable, 1350×940', icon: 'i-heroicons-computer-desktop' },
]
</script>

<template>
  <div class="max-w-3xl">
    <header class="mb-8">
      <NuxtLink to="/" class="text-sm text-muted hover:text-default transition-colors inline-flex items-center gap-1.5 mb-4">
        <UIcon name="i-heroicons-arrow-left" class="size-3.5" /> Back to sites
      </NuxtLink>
      <h1 class="text-2xl font-semibold text-highlighted">
        Add a site
      </h1>
      <p class="text-sm text-muted mt-1.5 max-w-xl">
        Register a site to track Lighthouse audits and history over time.
      </p>
    </header>

    <form @submit.prevent="submit">
      <div class="rounded-sm ring-1 ring-default bg-elevated/40 divide-y divide-default">
        <section class="p-6">
          <div class="mb-5">
            <h2 class="text-sm font-semibold text-highlighted">
              Site details
            </h2>
            <p class="text-xs text-muted mt-1">
              The URL crawled when you run a scan.
            </p>
          </div>

          <div class="space-y-5">
            <UFormField label="Website URL" :error="urlError" required>
              <UInput
                v-model="form.url"
                name="url"
                type="url"
                autocomplete="url"
                placeholder="https://example.com"
                size="lg"
                icon="i-heroicons-globe-alt"
                class="w-full"
                :ui="{ root: 'w-full' }"
              />
            </UFormField>

            <UFormField label="Display name" hint="Optional. Defaults to the hostname.">
              <UInput
                v-model="form.name"
                placeholder="Marketing"
                class="w-full"
                :ui="{ root: 'w-full' }"
              />
            </UFormField>

            <UFormField label="Group" hint="Organise related sites under a shared label.">
              <USelect
                v-model="form.group"
                :items="[{ label: 'Ungrouped', value: null }, ...groups.map(g => ({ label: g.name, value: g.id }))]"
                class="w-full"
                :ui="{ base: 'w-full' }"
              />
            </UFormField>
          </div>
        </section>

        <section class="p-6">
          <div class="mb-5">
            <h2 class="text-sm font-semibold text-highlighted">
              Default scan profile
            </h2>
            <p class="text-xs text-muted mt-1">
              Used when you trigger a scan without overriding device or throttling.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="d in devices"
              :key="d.id"
              type="button"
              class="text-left rounded-sm ring-1 p-4 transition-colors"
              :class="form.device === d.id
                ? 'ring-accented bg-elevated'
                : 'ring-default hover:bg-elevated/60'"
              @click="form.device = d.id"
            >
              <div class="flex items-center gap-2 mb-2">
                <UIcon :name="d.icon" class="size-4 text-muted" />
                <span class="text-sm font-medium text-highlighted">{{ d.label }}</span>
                <UIcon
                  v-if="form.device === d.id"
                  name="i-heroicons-check-circle-16-solid"
                  class="size-4 ml-auto text-highlighted"
                />
              </div>
              <div class="text-xs text-muted">
                {{ d.hint }}
              </div>
            </button>
          </div>
        </section>

        <section class="p-6">
          <label class="flex items-start justify-between gap-6 cursor-pointer">
            <div>
              <div class="text-sm font-medium text-highlighted">
                Scan immediately
              </div>
              <div class="text-xs text-muted mt-1 max-w-md">
                Run a Lighthouse audit right after adding. You will be redirected to the live progress view.
              </div>
            </div>
            <USwitch v-model="form.scanNow" />
          </label>
        </section>
      </div>

      <div class="flex items-center justify-between gap-3 mt-6">
        <div class="text-xs text-dimmed">
          You can change these settings later from the site page.
        </div>
        <div class="flex items-center gap-2">
          <UiMotionButton variant="ghost" color="neutral" to="/">
            Cancel
          </UiMotionButton>
          <UiMotionButton type="submit" intensity="cta" color="primary" :loading="submitting" icon="i-heroicons-plus">
            Add site
          </UiMotionButton>
        </div>
      </div>
    </form>
  </div>
</template>
