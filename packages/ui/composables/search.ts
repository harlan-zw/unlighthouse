import type { UnlighthouseRouteReport, UnlighthouseTaskStatus } from '@unlighthouse/core'
import Fuse from 'fuse.js'
import { get, isEmpty, orderBy } from 'lodash-es'
import { configColumns, groupRoutesKey } from './unlighthouse'
import { unlighthouseReports } from './state'

export interface Sorting {
  key?: string
  dir?: 'asc' | 'desc'
}

// Shared state
export const searchText = ref('')
export const sorting = ref<Sorting>({})
export const page = ref(1)
export const perPage = 10

// Computed columns
export const columns = computed(() => Object.values(configColumns.value))

export function incrementSort(key: string) {
  const val = sorting.value
  if (val.key === key) {
    if (val.dir === undefined) sorting.value.dir = 'asc'
    else if (val.dir === 'asc') sorting.value.dir = 'desc'
    else sorting.value = {}
  }
  else {
    sorting.value = { key, dir: 'asc' }
  }
}

export const searchResults = computed<UnlighthouseRouteReport[]>(() => {
  let data = unlighthouseReports.value || []
  if (!Array.isArray(data)) data = []

  // Apply search filter
  if (searchText.value && data.length > 0) {
    const fuse = new Fuse(data, {
      threshold: 0.3,
      shouldSort: isEmpty(sorting.value),
      keys: ['route.definition.name', 'route.path', 'seo.title'],
    })
    data = fuse.search<UnlighthouseRouteReport>(searchText.value).map(i => i.item)
  }

  // Map category data
  data = data.map((i) => {
    if (i.report?.categories && Array.isArray(i.report.categories)) {
      const categoryMap: Record<string, any> = {};
      (i.report.categories as any[]).forEach((c) => {
        if (c?.id) categoryMap[c.id] = c
      })
      ;(i.report as any).categoryMap = categoryMap
    }
    return i
  })

  // Sort by status first
  const statusRank = (s: UnlighthouseTaskStatus) => {
    if (s === 'completed') return 2
    if (s === 'in-progress') return 1
    return 0
  }
  data = data.sort((a, b) => {
    return statusRank(b.tasks?.runLighthouseTask || 'waiting') - statusRank(a.tasks?.runLighthouseTask || 'waiting')
  })

  // Apply sorting
  const sortVal = sorting.value
  const grKey = groupRoutesKey.value

  if (sortVal.key) {
    let sortKey = sortVal.key
    if (sortKey.startsWith('report.categories.') && sortKey.endsWith('.score')) {
      sortKey = sortKey.replace('.categories.', '.categoryMap.')
    }

    let doLengthSort = false
    const columnDef = columns.value.flat().find((c: any) => c?.key === sortKey)
    if ((columnDef as any)?.sortKey) {
      if ((columnDef as any).sortKey.startsWith('length:')) {
        doLengthSort = true
        sortKey = `${sortKey}.${(columnDef as any).sortKey.replace('length:', '')}`
      }
      else {
        sortKey = `${sortKey}.${(columnDef as any).sortKey}`
      }
    }

    data = orderBy(data, doLengthSort ? (i: any) => get(i, sortKey)?.length || 0 : sortKey, sortVal.dir)
  }
  else {
    data = orderBy(data, grKey, 'asc')
  }

  return data
})

export const paginatedResults = computed(() => {
  const offset = (page.value - 1) * perPage
  return searchResults.value.slice(offset, offset + perPage)
})
