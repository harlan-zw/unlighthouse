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

// Single confirm modal for delete, keyed on the pending row (vs one
// AlertDialog per card).
const pendingDelete = ref<Site | null>(null)

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
  if (!formUrl.value.trim())
    return
  let url = formUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://'))
    url = `https://${url}`

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
    pendingDelete.value = null
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
    if (s.group?.trim())
      set.add(s.group.trim())
  }
  return Array.from(set).sort()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-highlighted">
          Sites
        </h1>
        <p class="text-sm text-muted">
          Manage your monitored websites.
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openAdd">
        Add Site
      </UButton>
    </div>

    <div v-if="!sitesData?.sites?.length" class="flex flex-col items-center justify-center py-16 text-center">
      <UIcon name="i-lucide-globe" class="size-12 text-dimmed mb-4" />
      <p class="text-muted">
        No sites registered yet.
      </p>
      <p class="text-xs text-muted mt-1">
        Add a site to start monitoring.
      </p>
    </div>

    <section v-for="bucket in grouped" v-else :key="bucket.name || '__ungrouped'" class="space-y-3">
      <div class="flex items-center gap-2">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">
          {{ bucket.name || 'Ungrouped' }}
        </h2>
        <UBadge color="neutral" variant="subtle" size="sm" class="tabular-nums">
          {{ bucket.items.length }}
        </UBadge>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UCard v-for="site in bucket.items" :key="site.id">
          <div class="flex items-start justify-between mb-3">
            <NuxtLink :to="`/sites/${siteSlug(site.url)}`" class="min-w-0 flex-1 group">
              <div class="font-medium text-sm truncate text-highlighted group-hover:text-primary transition-colors">
                {{ site.name }}
              </div>
              <div class="text-xs text-muted font-mono truncate mt-0.5">
                {{ site.url }}
              </div>
            </NuxtLink>
          </div>
          <div class="text-xs text-muted mb-3">
            Added {{ new Date(site.createdAt).toLocaleDateString() }}
            <span v-if="site.group"> · {{ site.group }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-radar"
              size="sm"
              color="neutral"
              variant="outline"
              class="flex-1 justify-center"
              @click="scanSite(site.url)"
            >
              Scan
            </UButton>
            <UButton
              icon="i-lucide-pencil"
              size="sm"
              color="neutral"
              variant="ghost"
              aria-label="Edit site"
              @click="openEdit(site)"
            />
            <UButton
              icon="i-lucide-trash-2"
              size="sm"
              color="neutral"
              variant="ghost"
              aria-label="Remove site"
              @click="pendingDelete = site"
            />
          </div>
        </UCard>
      </div>
    </section>

    <!-- Add / Edit -->
    <UModal v-model:open="formOpen" :title="editing ? 'Edit Site' : 'Add Site'">
      <template #body>
        <form id="site-form" class="space-y-4" @submit.prevent="saveSite">
          <div class="space-y-2">
            <label class="text-sm font-medium">URL</label>
            <UInput v-model="formUrl" placeholder="https://example.com" required class="w-full font-mono" />
            <p v-if="editing && formUrl !== editing.url" class="text-[11px] text-warning">
              Changing the URL creates a new site — the old one will remain.
            </p>
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">Display name <span class="text-muted text-xs">(optional)</span></label>
            <UInput v-model="formName" :placeholder="editing?.name || 'example.com'" class="w-full" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium">Group <span class="text-muted text-xs">(optional)</span></label>
            <UInput v-model="formGroup" list="site-group-suggestions" placeholder="e.g. Production, Staging" class="w-full" />
            <datalist id="site-group-suggestions">
              <option v-for="g in groupSuggestions" :key="g" :value="g" />
            </datalist>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="formOpen = false">
            Cancel
          </UButton>
          <UButton type="submit" form="site-form" :loading="saving" :disabled="!formUrl.trim()">
            {{ editing ? 'Save' : 'Add' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete confirm -->
    <UModal
      :open="!!pendingDelete"
      title="Remove site?"
      :description="pendingDelete ? `This removes ${pendingDelete.name} from the registry. Scan history will be preserved.` : ''"
      @update:open="(v: boolean) => { if (!v) pendingDelete = null }"
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="pendingDelete = null">
            Cancel
          </UButton>
          <UButton color="error" @click="pendingDelete && deleteSite(pendingDelete.id)">
            Remove
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
