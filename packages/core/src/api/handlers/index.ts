// Aggregator for the v2 transport-agnostic handler set.

import type { HandlerMap } from './types'
import { assertEvaluate } from './assert'
import { compareDetail, compareFindPrevious, compareMarkdown, compareRun } from './compare'
import { eventsSubscribe, eventsTail } from './events'
import { historyList, historyPrune, historyRescan } from './history'
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

export * from './execute'

export function createHandlers(): HandlerMap {
  return {
    'scan.start': scanStart,
    'scan.status': scanStatus,
    'scan.cancel': scanCancel,
    'scan.pause': scanPause,
    'scan.resume': scanResume,
    'scan.delete': scanDelete,
    'scan.import': scanImport,
    'scan.results': scanResults,
    'scan.summary': scanSummary,
    'scan.meta': scanMeta,
    'scan.current': scanCurrent,
    'scan.rescanAll': scanRescanAll,
    'route.get': routeGet,
    'route.audits': routeAudits,
    'route.rescan': routeRescan,
    'scan.categories': scanCategories,
    'history.list': historyList,
    'history.rescan': historyRescan,
    'history.prune': historyPrune,
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
  }
}

export * from './types'
