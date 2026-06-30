import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

export interface Site {
  id: string
  name: string
  url: string
  group: string | null
  createdAt: string
}

interface SiteBucket {
  name: string
  items: Site[]
}

function normalizeSiteUrl(value: string): string {
  const url = value.trim()
  if (url.startsWith('http://') || url.startsWith('https://'))
    return url
  return `https://${url}`
}

export function useSitesRegistry() {
  const router = useRouter()

  const { data: sitesData, error: sitesError, refresh } = useApiQuery('sites.list', () => ({}))

  // Both write paths invalidate the list, so it refetches automatically
  // instead of the old manual `refresh()` after each call.
  const createSite = useApiMutation('sites.create', { invalidates: ['sites.list'] })
  const deleteSiteMutation = useApiMutation('sites.delete', { invalidates: ['sites.list'] })

  const editing = ref<Site | null>(null)
  const formOpen = ref(false)
  const formUrl = ref('')
  const formName = ref('')
  const formGroup = ref('')
  const saving = createSite.isPending

  const sites = computed(() => (sitesData.value?.sites ?? []) as Site[])
  const isEmpty = computed(() => !sites.value.length)

  function resetForm() {
    editing.value = null
    formUrl.value = ''
    formName.value = ''
    formGroup.value = ''
  }

  function openAdd() {
    resetForm()
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

    const result = await createSite.mutateSafe({
      url: normalizeSiteUrl(formUrl.value),
      name: formName.value.trim() || undefined,
      group: formGroup.value.trim() || null,
    })
    if (result._tag === 'err') {
      toast.error(editing.value ? 'Failed to update' : 'Failed to add', { description: normalizeApiError(result.error).message })
      return
    }
    toast.success(editing.value ? 'Site updated' : 'Site added')
    formOpen.value = false
  }

  async function deleteSite(id: string) {
    const result = await deleteSiteMutation.mutateSafe({ id })
    if (result._tag === 'err') {
      toast.error('Failed to delete', { description: normalizeApiError(result.error).message })
      return
    }
    toast.success('Site removed')
  }

  function scanSite(url: string) {
    router.push({ path: '/scan/new', query: { url } })
  }

  const grouped = computed<SiteBucket[]>(() => {
    const buckets = new Map<string, Site[]>()
    for (const site of sites.value) {
      const key = site.group?.trim() || ''
      const bucket = buckets.get(key) ?? []
      bucket.push(site)
      buckets.set(key, bucket)
    }

    const named = Array.from(buckets.entries())
      .filter(([key]) => key !== '')
      .sort((a, b) => a[0].localeCompare(b[0]))
    const ungrouped = buckets.get('') ?? []
    const ordered = named.map(([name, items]) => ({ name, items }))
    if (ungrouped.length)
      ordered.push({ name: '', items: ungrouped })
    return ordered
  })

  const groupSuggestions = computed(() => {
    const groups = new Set<string>()
    for (const site of sites.value) {
      if (site.group?.trim())
        groups.add(site.group.trim())
    }
    return Array.from(groups).sort()
  })

  return {
    sites,
    sitesError,
    refresh,
    isEmpty,
    editing,
    formOpen,
    formUrl,
    formName,
    formGroup,
    saving,
    grouped,
    groupSuggestions,
    openAdd,
    openEdit,
    saveSite,
    deleteSite,
    scanSite,
  }
}
