<script setup lang="ts">
import { useSites } from '~/composables/sites'

definePageMeta({ layout: 'site' })

const route = useRoute()
const { getSite, groups, removeSite, addSite } = useSites()
const site = getSite(route.params.siteId as string)
const toast = useToast()

const form = reactive({
  name: site.value?.name ?? '',
  url: site.value?.url ?? '',
  group: site.value?.group ?? null as string | null,
  device: site.value?.device ?? 'mobile' as 'mobile' | 'desktop',
})

watch(site, (s) => {
  if (s) {
    form.name = s.name
    form.url = s.url
    form.group = s.group
    form.device = s.device
  }
})

async function save() {
  if (!site.value)
    return
  await addSite({
    name: form.name,
    url: form.url,
    group: form.group,
    device: form.device,
  }).catch((err: Error) => {
    toast.add({ title: 'Could not save', description: err.message, color: 'error' })
    return null
  })
  toast.add({ title: 'Settings saved', color: 'success' })
}

const confirmDelete = ref(false)
async function doDelete() {
  if (!site.value)
    return
  await removeSite(site.value.id)
  navigateTo('/')
}
</script>

<template>
  <div v-if="site" class="max-w-2xl">
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-highlighted">
        Site settings
      </h1>
      <p class="text-sm text-muted mt-1">
        Manage how this site appears and is scanned.
      </p>
    </header>

    <form class="space-y-6 rounded-xl ring-1 ring-default bg-elevated/40 p-6" @submit.prevent="save">
      <UFormField label="Name">
        <UInput v-model="form.name" />
      </UFormField>
      <UFormField label="URL">
        <UInput v-model="form.url" type="url" />
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
            @click="form.device = d"
          >
            {{ d }}
          </UButton>
        </div>
      </UFormField>
      <div class="flex justify-end pt-2">
        <UButton type="submit" color="primary">
          Save changes
        </UButton>
      </div>
    </form>

    <div class="mt-6 rounded-xl ring-1 ring-error/30 bg-error/5 p-6">
      <h2 class="font-medium text-error mb-1">
        Remove site
      </h2>
      <p class="text-sm text-muted mb-4">
        This removes the site from the registry. Past scan history is kept.
      </p>
      <UButton color="error" variant="soft" @click="confirmDelete = true">
        Remove site
      </UButton>
    </div>

    <UModal v-model:open="confirmDelete" title="Remove site?">
      <template #body>
        <p class="text-muted p-4">
          Remove <strong>{{ site.name }}</strong>? This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4">
          <UButton variant="ghost" color="neutral" @click="confirmDelete = false">
            Cancel
          </UButton>
          <UButton color="error" @click="doDelete">
            Remove
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
