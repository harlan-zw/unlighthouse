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
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <header class="mb-8">
      <NuxtLink to="/" class="text-sm text-muted hover:text-default transition-colors inline-flex items-center gap-1 mb-3">
        <UIcon name="i-heroicons-arrow-left" class="size-3.5" /> Back to sites
      </NuxtLink>
      <h1 class="text-2xl font-semibold text-highlighted">
        Add a site
      </h1>
      <p class="text-sm text-muted mt-1">
        Register a site to track Lighthouse audits and history over time.
      </p>
    </header>

    <form class="space-y-6 rounded-xl ring-1 ring-default bg-elevated/40 p-6" @submit.prevent="submit">
      <UFormField label="Website URL" :error="urlError">
        <UInput
          v-model="form.url"
          name="url"
          type="url"
          autocomplete="url"
          placeholder="https://example.com"
          size="lg"
        />
      </UFormField>

      <UFormField label="Display name" hint="Optional. Defaults to the hostname.">
        <UInput v-model="form.name" placeholder="Marketing" />
      </UFormField>

      <UFormField label="Group">
        <USelect
          v-model="form.group"
          :items="[{ label: 'Ungrouped', value: null }, ...groups.map(g => ({ label: g.name, value: g.id }))]"
        />
      </UFormField>

      <UFormField label="Default device">
        <div class="flex gap-2">
          <UButton
            v-for="d in ['mobile', 'desktop'] as const"
            :key="d"
            :variant="form.device === d ? 'solid' : 'outline'"
            :color="form.device === d ? 'primary' : 'neutral'"
            type="button"
            class="capitalize"
            :icon="d === 'mobile' ? 'i-heroicons-device-phone-mobile' : 'i-heroicons-computer-desktop'"
            @click="form.device = d"
          >
            {{ d }}
          </UButton>
        </div>
      </UFormField>

      <UFormField>
        <div class="flex items-center justify-between border-t border-default pt-4">
          <div>
            <div class="font-medium">
              Scan immediately
            </div>
            <div class="text-sm text-dimmed">
              Run a Lighthouse audit right after adding.
            </div>
          </div>
          <USwitch v-model="form.scanNow" />
        </div>
      </UFormField>

      <div class="flex items-center justify-end gap-3 pt-2">
        <UButton variant="ghost" color="neutral" to="/">
          Cancel
        </UButton>
        <UButton type="submit" color="primary" :loading="submitting" icon="i-heroicons-plus">
          Add site
        </UButton>
      </div>
    </form>
  </div>
</template>
