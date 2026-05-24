// Aggregator for the v2 transport-agnostic handler set.

import type { HandlerMap } from './types'
import { assertEvaluate } from './assert'
import { compareDetail, compareFindPrevious, compareMarkdown, compareRun } from './compare'
import { eventsSubscribe, eventsTail } from './events'
import { historyList, historyRescan } from './history'
import { auditorsList, health, manifest } from './meta'
import { packList, packRun } from './pack'
import { queryRoutes } from './query'
import { routeRescan } from './route'
import {
  scanCancel,
  scanCurrent,
  scanDelete,
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

export function createHandlers(): HandlerMap {
  return {
    'scan.start': scanStart,
    'scan.status': scanStatus,
    'scan.cancel': scanCancel,
    'scan.pause': scanPause,
    'scan.resume': scanResume,
    'scan.delete': scanDelete,
    'scan.results': scanResults,
    'scan.summary': scanSummary,
    'scan.meta': scanMeta,
    'scan.current': scanCurrent,
    'scan.rescanAll': scanRescanAll,
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
    'auditors.list': auditorsList,
    'sites.list': sitesList,
    'sites.create': sitesCreate,
    'sites.delete': sitesDelete,
  } as unknown as HandlerMap
}

export type { SitesStore, SitesStoreCreateInput } from './sites'
export * from './types'
export * from './wrap'
