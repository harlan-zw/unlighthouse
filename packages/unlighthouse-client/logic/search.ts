import { useStorage } from '@vueuse/core'
import { computed } from 'vue'
import Fuse from 'fuse.js'
import groupBy from 'lodash/groupBy'
import { isEmpty, orderBy } from 'lodash'
import { UnlighthouseRouteReport } from '@shared'
import { wsReports } from './state'

type SortDirection = 'asc'|'desc'

export const searchText = useStorage('unplugin-lighthouse-search-text', '')
export const sorting = useStorage<{
  score?: SortDirection
  ['route.definition.name']?: SortDirection
}>('unplugin-lighthouse-sort', { 'route.definition.name': 'asc' })

export const searchResults = computed<Record<string, UnlighthouseRouteReport[]>>(() => {
  let data = [...wsReports.values()]
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

  if (!isEmpty(sorting.value))
    data = orderBy(data, Object.keys(sorting.value), Object.values(sorting.value))

  return groupBy(
    data,
    report => report.route.definition.name,
  )
})
