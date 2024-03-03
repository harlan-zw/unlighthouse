import { useStorage } from '@vueuse/core'
import { computed } from 'vue'
import Fuse from 'fuse.js'
import { get, isEmpty, orderBy } from 'lodash-es'
import type { UnlighthouseRouteReport, UnlighthouseTaskStatus } from '@unlighthouse/core'
import { unlighthouseReports } from './state'
import { columns, groupRoutesKey } from './static'

type SortDirection = 'asc' | 'desc'
export interface Sorting {
  key?: string
  dir?: SortDirection
}

export const searchText = useStorage('unlighthouse-search-text', '')
export const sorting = useStorage<Sorting>('unlighthouse-sort', { key: groupRoutesKey, dir: 'asc' })

export function incrementSort(key: string) {
  const val = sorting.value as Sorting

  // increment the sort
  if (val.key === key) {
    const sort = val.dir
    if (typeof sort === 'undefined')
      sorting.value.dir = 'asc'
    else if (sort === 'asc')
      sorting.value.dir = 'desc'
    else
      sorting.value = {}
  }
  else {
    sorting.value.key = key
    sorting.value.dir = 'asc'
  }
}

export const searchResults = computed<UnlighthouseRouteReport[]>(() => {
  let data = unlighthouseReports.value
  if (searchText.value) {
    const fuse = new Fuse(data, {
      threshold: 0.3,
      shouldSort: isEmpty(sorting.value),
      keys: [
        'route.definition.name',
        'route.path',
        'seo.title',
      ],
    })

    data = fuse.search<UnlighthouseRouteReport>(searchText.value).map(i => i.item)
  }
  // need to map the data to make the scores easier to sort
  data = data.map((i) => {
    // current categories are an array with a number index, we need to make a new object
    if (i.report?.categories) {
      i.report.categoryMap = {}
      i.report.categories.forEach((c) => {
        i.report!.categoryMap[c.id] = c
      })
    }
    return i
  })

  function statusToSortRank(s: UnlighthouseTaskStatus) {
    switch (s) {
      case 'completed':
        return 2
      case 'in-progress':
        return 1
    }
    return 0
  }
  // always order data by status, we want to show success -> in progress -> waiting
  data = data.sort((a, b) => {
    const aStatus = statusToSortRank(a.tasks.runLighthouseTask)
    const bStatus = statusToSortRank(b.tasks.runLighthouseTask)
    return bStatus - aStatus
  })

  if (sorting.value.key) {
    let sortKey = sorting.value.key
    if (sortKey.startsWith('report.categories.') && sortKey.endsWith('.score')) {
      // need to convert the category key to the index
      sortKey = sortKey.replace('.categories.', '.categoryMap.')
    }
    let doLengthSort = false
    const columnDefinition = columns.flat().find(c => c.key === sortKey)
    if (columnDefinition?.sortKey) {
      if (columnDefinition.sortKey.startsWith('length:')) {
        doLengthSort = true
        sortKey = `${sortKey}.${columnDefinition.sortKey.replace('length:', '')}`
      }
      else {
        sortKey = `${sortKey}.${columnDefinition.sortKey}`
      }
    }
    data = orderBy(data, doLengthSort
      ? i => get(i, sortKey)?.length || 0
      : sortKey, sorting.value.dir)
  }
  else {
    // sort by the group routes key
    data = orderBy(data, groupRoutesKey, 'asc')
  }

  return data
})

export const page = ref(1)
export const perPage = 10

export const paginatedResults = computed(() => {
  const data = searchResults.value
  const offset = (page.value - 1) * perPage
  return data.slice(offset, offset + perPage)
})
