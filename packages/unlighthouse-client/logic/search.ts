import { useStorage } from '@vueuse/core'
import { computed } from 'vue'
import Fuse from 'fuse.js'
import groupBy from 'lodash/groupBy'
import { isEmpty, orderBy } from 'lodash'
import { UnlighthouseRouteReport } from '@shared'
import { wsReports } from './state'
import { groupRoutes, columns } from './static'
import get from "lodash/get";

type SortDirection = 'asc'|'desc'
export type Sorting = {
  key?: string
  dir?: SortDirection
}

export const searchText = useStorage('unlighthouse-search-text', '')
export const sorting = useStorage<Sorting>('unlighthouse-sort', { key: 'route.definition.name', dir: 'asc' })

export const searchResults = computed<Record<string, UnlighthouseRouteReport[]>>(() => {
  let data = [...wsReports.values()]
  if (searchText.value) {

    const sortKeys = columns
        .flat()
        .filter(c => (c.sortable === true || !!c.sortKey) && typeof c.key === 'string')
        .map(c => c.key) as string[]

    const fuse = new Fuse(data, {
      threshold: 0.3,
      shouldSort: isEmpty(sorting.value),
      keys: [
        'route.definition.name',
        'route.path',
        'seo.title',
        ...sortKeys,
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
      } else {
        sortKey = `${sortKey}.${columnDefinition.sortKey}`
      }
    }
    data = orderBy(data, doLengthSort ?
        (i) => get(i, sortKey)?.length || 0 :
        sortKey, sorting.value.dir
    )
  }

  return groupBy(
      data,
      groupRoutes && !sorting.value.key ? 'route.definition.name' : 'route.path',
  )
})
