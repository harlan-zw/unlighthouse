import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { normalizeSiteUrl } from '~/utils/site-url'

export interface Site {
  id: string
  name: string
  url: string
  group: string | null
  createdAt: string
}

export function useSitesRegistry() {
  const router = useRouter()

  // Site-list read for `groupSuggestions` only. The merged Sites home page
  // (features/sites/home.ts) owns the row-level `sites.list` read; nuxt-use-query
  // dedupes both against the same cache key.
  const { data: sitesData } = useApiQuery('sites.list', () => ({}))

  // Both write paths invalidate the list, so it refetches automatically
  // instead of the old manual `refresh()` after each call.
  const createSite = useApiMutation('sites.create', { invalidates: ['sites.list'] })
  const deleteSiteMutation = useApiMutation('sites.delete', { invalidates: ['sites.list'] })

  const editing = ref<Site | null>(null)
  const formOpen = ref(false)
  const formUrl = ref('')
  const formUrlError = ref('')
  const formName = ref('')
  const formGroup = ref('')
  const saving = createSite.isPending

  const sites = computed(() => (sitesData.value?.sites ?? []) as Site[])

  function resetForm() {
    editing.value = null
    formUrl.value = ''
    formUrlError.value = ''
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

  // Prefills the add form with an origin discovered via scan history rather
  // than typed by hand. Used to register an unregistered origin from the
  // Sites home table.
  function openRegister(url: string) {
    resetForm()
    formUrl.value = url
    formOpen.value = true
  }

  async function saveSite() {
    if (!formUrl.value.trim())
      return

    const url = normalizeSiteUrl(formUrl.value)
    if (!url) {
      formUrlError.value = 'Enter a valid web address, such as example.com.'
      await nextTick()
      document.getElementById('site-url')?.focus()
      return
    }

    const result = await createSite.mutateSafe({
      url,
      name: formName.value.trim() || undefined,
      group: formGroup.value.trim() || null,
    })
    if (result._tag === 'err') {
      toast.error(editing.value ? 'Site update failed' : 'Site add failed', { description: `${normalizeApiError(result.error).message}. Check the URL and retry.` })
      return
    }
    toast.success(editing.value ? 'Site updated' : 'Site added')
    formOpen.value = false
  }

  async function deleteSite(id: string) {
    const result = await deleteSiteMutation.mutateSafe({ id })
    if (result._tag === 'err') {
      toast.error('Site delete failed', { description: `${normalizeApiError(result.error).message}. Check the scan host and retry.` })
      return
    }
    toast.success('Site removed')
  }

  function scanSite(url: string) {
    router.push({ path: '/scan/new', query: { url } })
  }

  const groupSuggestions = computed(() => {
    const groups = new Set<string>()
    for (const site of sites.value) {
      if (site.group?.trim())
        groups.add(site.group.trim())
    }
    return Array.from(groups).sort()
  })

  watch(formUrl, () => {
    formUrlError.value = ''
  })

  return {
    editing,
    formOpen,
    formUrl,
    formUrlError,
    formName,
    formGroup,
    saving,
    groupSuggestions,
    openAdd,
    openEdit,
    openRegister,
    saveSite,
    deleteSite,
    scanSite,
  }
}
