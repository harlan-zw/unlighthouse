import { useStorage } from '@vueuse/core'
import { computed } from 'vue'
import Fuse from 'fuse.js'
import { get, groupBy, isEmpty, orderBy } from 'lodash-es'
import type { UnlighthouseRouteReport } from '@unlighthouse/core'
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

export const searchResults = computed<Record<string, UnlighthouseRouteReport[]>>(() => {
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

  if (sorting.value.key) {
    let sortKey = sorting.value.key
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
      : sortKey, sorting.value.dir,
    )
  }
  else {
    // sort by the group routes key
    data = orderBy(data, groupRoutesKey, 'asc')
  }

  return groupBy(
    data,
    (!sorting.value.key || sorting.value.key === groupRoutesKey) ? groupRoutesKey : 'route.path',
  )
})
