import type { UnlighthouseRouteReport, UnlighthouseTaskStatus } from '@unlighthouse/contracts'
import Fuse from 'fuse.js'
import { get, isEmpty, orderBy } from 'lodash-es'
import { useReports } from './useReports'
import { useUnlighthouseConfig } from './useUnlighthouseConfig'

export interface Sorting {
  key?: string
  dir?: 'asc' | 'desc'
}

export const perPage = 10

export function useResultsSearch() {
  const searchText = useState<string>('search:text', () => '')
  const sorting = useState<Sorting>('search:sorting', () => ({}))
  const page = useState<number>('search:page', () => 1)

  const { reports } = useReports()
  const { configColumns, groupRoutesKey } = useUnlighthouseConfig()

  const columns = computed(() => Object.values(configColumns.value))

  function incrementSort(key: string) {
    const val = sorting.value
    if (val.key === key) {
      if (val.dir === undefined)
        sorting.value = { ...val, dir: 'asc' }
      else if (val.dir === 'asc')
        sorting.value = { ...val, dir: 'desc' }
      else sorting.value = {}
    }
    else {
      sorting.value = { key, dir: 'asc' }
    }
  }

  const searchResults = computed<UnlighthouseRouteReport[]>(() => {
    let data = reports.value || []
    if (!Array.isArray(data))
      data = []

    if (searchText.value && data.length > 0) {
      const fuse = new Fuse(data, {
        threshold: 0.3,
        shouldSort: isEmpty(sorting.value),
        keys: ['route.definition.name', 'route.path', 'seo.title'],
      })
      data = fuse.search(searchText.value).map((i: { item: UnlighthouseRouteReport }) => i.item)
    }

    const statusRank = (s: UnlighthouseTaskStatus) => {
      if (s === 'completed')
        return 2
      if (s === 'in-progress')
        return 1
      return 0
    }
    data = [...data].sort((a: UnlighthouseRouteReport, b: UnlighthouseRouteReport) => {
      return statusRank(b.tasks?.runLighthouseTask || 'waiting') - statusRank(a.tasks?.runLighthouseTask || 'waiting')
    })

    const sortVal = sorting.value
    if (sortVal.key) {
      let sortKey = sortVal.key
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

      // `report.categories` is an array of `{ id, score, ... }`. Resolve by
      // id at read-time so reports don't need an ingest-time projection.
      const CATEGORIES_PREFIX = 'report.categories.'
      const resolve = sortKey.startsWith(CATEGORIES_PREFIX)
        ? (() => {
            const rest = sortKey.slice(CATEGORIES_PREFIX.length)
            const dot = rest.indexOf('.')
            const id = dot === -1 ? rest : rest.slice(0, dot)
            const tail = dot === -1 ? '' : rest.slice(dot + 1)
            return (r: any) => {
              const cats = r?.report?.categories
              if (!Array.isArray(cats))
                return undefined
              const cat = cats.find((c: any) => c?.id === id)
              return tail ? get(cat, tail) : cat
            }
          })()
        : (r: any) => get(r, sortKey)

      data = orderBy(data, doLengthSort ? (i: any) => resolve(i)?.length || 0 : resolve, sortVal.dir)
    }
    else {
      data = orderBy(data, groupRoutesKey.value, 'asc')
    }

    return data
  })

  const paginatedResults = computed(() => {
    const offset = (page.value - 1) * perPage
    return searchResults.value.slice(offset, offset + perPage)
  })

  return {
    searchText,
    sorting,
    page,
    perPage,
    columns,
    incrementSort,
    searchResults,
    paginatedResults,
  }
}
