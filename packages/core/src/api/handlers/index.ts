// Aggregator for the v2 transport-agnostic handler set.

import type { HandlerMap } from './types'
import { assertEvaluate } from './assert'
import { compareDetail, compareFindPrevious, compareMarkdown, compareRun } from './compare'
import { eventsSubscribe, eventsTail } from './events'
import { historyList, historyRescan } from './history'
import { auditorsList, health, manifest, ready } from './meta'
import { packList, packRun } from './pack'
import { queryRoutes } from './query'
import { routeAudits, routeGet, routeRescan } from './route'
import {
  scanCancel,
  scanCategories,
  scanCurrent,
  scanDelete,
  scanImport,
  scanMeta,
  scanPause,
  scanRescanAll,
  scanResults,
  scanResume,
  scanStart,
  scanStatus,
  scanSummary,
} from './scan'
import { sitesCreate, sitesDelete, sitesList } from './sites'

export { assertEvaluate } from './assert'
export { compareDetail, compareFindPrevious, compareMarkdown, compareRun } from './compare'
export { eventsSubscribe, eventsTail } from './events'
export { historyList, historyRescan } from './history'
export { auditorsList, health, manifest } from './meta'
export { packList, packRun } from './pack'
export { queryRoutes } from './query'
export { routeAudits, routeGet, routeRescan } from './route'
export {
  scanCancel,
  scanCategories,
  scanCurrent,
  scanDelete,
  scanImport,
  scanMeta,
  scanPause,
  scanRescanAll,
  scanResults,
  scanResume,
  scanStart,
  scanStatus,
  scanSummary,
} from './scan'
export { sitesCreate, sitesDelete, sitesList } from './sites'

export function createHandlers(): HandlerMap {
  const handlers = {
    'scan.start': scanStart,
    'scan.status': scanStatus,
    'scan.cancel': scanCancel,
    'scan.pause': scanPause,
    'scan.resume': scanResume,
    'scan.delete': scanDelete,
    'scan.import': scanImport,
    'scan.results': scanResults,
    'scan.summary': scanSummary,
    'scan.categories': scanCategories,
    'scan.meta': scanMeta,
    'scan.current': scanCurrent,
    'scan.rescanAll': scanRescanAll,
    'route.get': routeGet,
    'route.audits': routeAudits,
    'route.rescan': routeRescan,
    'history.list': historyList,
    'history.rescan': historyRescan,
    'compare.run': compareRun,
    'compare.detail': compareDetail,
    'compare.markdown': compareMarkdown,
    'compare.findPrevious': compareFindPrevious,
    'assert.evaluate': assertEvaluate,
    'pack.run': packRun,
    'pack.list': packList,
    'query.routes': queryRoutes,
    'events.subscribe': eventsSubscribe,
    'events.tail': eventsTail,
    'manifest': manifest,
    'health': health,
    'ready': ready,
    'auditors.list': auditorsList,
    'sites.list': sitesList,
    'sites.create': sitesCreate,
    'sites.delete': sitesDelete,
  } satisfies HandlerMap
  return handlers
}

export * from './types'
export * from './wrap'
