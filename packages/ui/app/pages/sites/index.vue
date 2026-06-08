<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'root' })

interface Site {
  id: string
  name: string
  url: string
  group: string | null
  createdAt: string
}

const api = useApi()
const router = useRouter()

const { data: sitesData, refresh } = useAsyncData(
  'sites-list',
  () => api['sites.list']({}).catch(() => ({ sites: [] as Site[] })),
)

// Add / Edit share the same dialog — `editing` is null for the add flow,
// or the existing site row for an in-place edit. sites.create already
// upserts by URL-derived id, so saving an edit with the same URL updates
// the name + group; changing the URL spawns a new row (intentional: the
// id is the URL origin, so "change URL" really means "new site").
const editing = ref<Site | null>(null)
const formOpen = ref(false)
const formUrl = ref('')
const formName = ref('')
const formGroup = ref('')
const saving = ref(false)

function openAdd() {
  editing.value = null
  formUrl.value = ''
  formName.value = ''
  formGroup.value = ''
  formOpen.value = true
}

function openEdit(site: Site) {
  editing.value = site
  formUrl.value = site.url
  formName.value = site.name
  formGroup.value = site.group ?? ''
  formOpen.value = true
}

async function saveSite() {
  if (!formUrl.value.trim()) return
  let url = formUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`

  saving.value = true
  try {
    await api['sites.create']({
      url,
      name: formName.value.trim() || undefined,
      // Empty string → null so an edit can wipe the group; the contract
      // permits null but the form value is always a string.
      group: formGroup.value.trim() || null,
    })
    toast.success(editing.value ? 'Site updated' : 'Site added')
    formOpen.value = false
    refresh()
  }
  catch (err: any) {
    toast.error(editing.value ? 'Failed to update' : 'Failed to add', { description: err.message })
  }
  finally {
    saving.value = false
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

// Bucket sites by their `group` field so the page reads like an org
// directory rather than a flat grid. Sites with no group land in a
// trailing "Ungrouped" section.
const grouped = computed(() => {
  const sites = (sitesData.value?.sites ?? []) as Site[]
  const buckets = new Map<string, Site[]>()
  for (const s of sites) {
    const key = s.group?.trim() || ''
    const arr = buckets.get(key) ?? []
    arr.push(s)
    buckets.set(key, arr)
  }
  // Named groups alphabetical, ungrouped last.
  const named = Array.from(buckets.entries())
    .filter(([k]) => k !== '')
    .sort((a, b) => a[0].localeCompare(b[0]))
  const ungrouped = buckets.get('') ?? []
  const out = named.map(([name, items]) => ({ name, items }))
  if (ungrouped.length)
    out.push({ name: '', items: ungrouped })
  return out
})

// All existing group names (for the datalist autocomplete) — typing a new
// one creates it implicitly, typing an existing one re-buckets the site.
const groupSuggestions = computed(() => {
  const set = new Set<string>()
  for (const s of (sitesData.value?.sites ?? []) as Site[]) {
    if (s.group?.trim()) set.add(s.group.trim())
  }
  return Array.from(set).sort()
})
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Sites" description="Manage your monitored websites." flush>
      <template #actions>
        <UModal v-model:open="formOpen" :title="editing ? 'Edit Site' : 'Add Site'" :ui="{ content: 'sm:max-w-md' }">
          <UButton color="primary" variant="solid" icon="i-lucide-plus" label="Add Site" @click="openAdd" />
          <template #body>
            <form id="site-form" class="space-y-4" @submit.prevent="saveSite">
              <UFormField label="URL">
                <UInput v-model="formUrl" placeholder="https://example.com" required class="w-full font-mono" />
              </UFormField>
              <p v-if="editing && formUrl !== editing.url" class="text-[11px] text-warning">
                Changing the URL creates a new site — the old one will remain.
              </p>
              <UFormField label="Display name" hint="optional">
                <UInput v-model="formName" :placeholder="editing?.name || 'example.com'" class="w-full" />
              </UFormField>
              <UFormField label="Group" hint="optional">
                <UInput v-model="formGroup" list="site-group-suggestions" placeholder="e.g. Production, Staging" class="w-full" />
                <datalist id="site-group-suggestions">
                  <option v-for="g in groupSuggestions" :key="g" :value="g" />
                </datalist>
              </UFormField>
            </form>
          </template>
          <template #footer>
            <UiButton purpose="cta" type="submit" form="site-form" :loading="saving" :disabled="saving || !formUrl.trim()">
              {{ editing ? 'Save' : 'Add' }}
            </UiButton>
          </template>
        </UModal>
      </template>
    </PageHeader>

    <div v-if="!sitesData?.sites?.length" class="flex flex-col items-center justify-center py-16 text-center">
      <Icon name="lucide:globe" class="size-12 text-muted-foreground/50 mb-4" />
      <p class="text-muted-foreground">No sites registered yet.</p>
      <p class="text-xs text-muted-foreground mt-1">Add a site to start monitoring.</p>
    </div>

    <section v-for="bucket in grouped" v-else :key="bucket.name || '__ungrouped'" class="space-y-3">
      <div class="flex items-center gap-2">
        <h2 class="eyebrow">
          {{ bucket.name || 'Ungrouped' }}
        </h2>
        <UBadge color="neutral" variant="soft" size="xs" class="tabular-nums">{{ bucket.items.length }}</UBadge>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UiCard v-for="site in bucket.items" :key="site.id" size="sm">
            <div class="flex items-start justify-between mb-3">
              <NuxtLink :to="`/sites/${siteSlug(site.url)}`" class="min-w-0 flex-1 group">
                <div class="font-medium text-sm truncate group-hover:text-primary transition-colors">{{ site.name }}</div>
                <div class="text-xs text-muted-foreground font-mono truncate mt-0.5">{{ site.url }}</div>
              </NuxtLink>
            </div>
            <div class="text-xs text-muted-foreground mb-3">
              Added {{ new Date(site.createdAt).toLocaleDateString() }}
              <span v-if="site.group"> · {{ site.group }}</span>
            </div>
            <div class="flex items-center gap-2">
              <UiButton purpose="secondary" size="sm" class="flex-1" icon="i-lucide-radar" @click="scanSite(site.url)">Scan</UiButton>
              <UiButton purpose="quiet" size="sm" icon="i-lucide-pencil" @click="openEdit(site)" />
              <UModal
                title="Remove site?"
                :description="`This removes ${site.name} from the registry. Scan history will be preserved.`"
              >
                <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" />
                <template #footer="{ close }">
                  <UiButton purpose="quiet" @click="close">Cancel</UiButton>
                  <UiButton purpose="danger" @click="() => { deleteSite(site.id); close() }">Remove</UiButton>
                </template>
              </UModal>
            </div>
        </UiCard>
      </div>
    </section>
  </div>
</template>
