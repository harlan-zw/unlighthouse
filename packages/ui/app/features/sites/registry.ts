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
  const api = useApi()
  const router = useRouter()

  const { data: sitesData, refresh } = useAsyncData(
    'sites-list',
    () => api['sites.list']({}).catch(() => ({ sites: [] as Site[] })),
  )

  const editing = ref<Site | null>(null)
  const formOpen = ref(false)
  const formUrl = ref('')
  const formName = ref('')
  const formGroup = ref('')
  const saving = ref(false)

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

    saving.value = true
    try {
      await api['sites.create']({
        url: normalizeSiteUrl(formUrl.value),
        name: formName.value.trim() || undefined,
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
