import { useStorage } from '@vueuse/core'
import { computed } from 'vue'
import Fuse from 'fuse.js'
import groupBy from 'lodash/groupBy'
import { isEmpty, orderBy } from 'lodash'
import { RouteReport } from '../../types'
import { fetchedReports } from './state'

type SortDirection = 'asc'|'desc'

export const searchText = useStorage('unplugin-lighthouse-search-text', '')
export const sorting = useStorage<{
  score?: SortDirection
  ['route.name']?: SortDirection
}>('unplugin-lighthouse-sort', {})

export const searchResults = computed<Record<string, RouteReport[]>>(() => {
  let data: RouteReport[] = fetchedReports.data || []
  if (searchText.value) {
    const fuse = new Fuse(data, {
      shouldSort: isEmpty(sorting.value),
      keys: [
        'route.name',
        'route.path',
        'seo.title',
      ],
    })

    data = fuse.search<RouteReport>(searchText.value).map(i => i.item)
  }

  console.log(sorting.value)
  if (!isEmpty(sorting.value))
    data = orderBy(data, Object.keys(sorting.value), Object.values(sorting.value))

  return groupBy(
    data,
    report => report.route.name,
  )
})
