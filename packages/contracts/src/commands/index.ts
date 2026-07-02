// Command registry — source of truth projected to HTTP, MCP, CLI.
// See v1.md §"Command registry" (line 706).

import type { Site } from './sites'
import { AssertEvaluate } from './assert'
import { CompareDetail, CompareFindPrevious, CompareMarkdown, CompareRun } from './compare'
import { EventsSubscribe, EventsTail } from './events'
import { HistoryList, HistoryPrune, HistoryRescan } from './history'
import { AuditorsList, Health, Manifest, Ready } from './meta'
import { PackList, PackRunCmd } from './pack'
import { QueryRoutes } from './query'
import { RouteAudits, RouteGet, RouteRescan } from './route'
import {
  ScanCancel,
  ScanCategories,
  ScanCurrent,
  ScanDelete,
  ScanImport,
  ScanMetaCmd,
  ScanPause,
  ScanRescanAll,
  ScanResults,
  ScanResume,
  ScanStart,
  ScanStatusCmd,
  ScanSummaryCmd,
} from './scan'
import { SiteSchema, SitesCreate, SitesDelete, SitesList } from './sites'

export * from './compare'
export * from './define'

export {
  AssertEvaluate,
  AuditorsList,
  CompareDetail,
  CompareFindPrevious,
  CompareMarkdown,
  CompareRun,
  EventsSubscribe,
  EventsTail,
  Health,
  HistoryList,
  HistoryPrune,
  HistoryRescan,
  Manifest,
  PackList,
  PackRunCmd,
  QueryRoutes,
  Ready,
  RouteAudits,
  RouteGet,
  RouteRescan,
  ScanCancel,
  ScanCategories,
  ScanCurrent,
  ScanDelete,
  ScanImport,
  ScanMetaCmd,
  ScanPause,
  ScanRescanAll,
  ScanResults,
  ScanResume,
  ScanStart,
  ScanStatusCmd,
  ScanSummaryCmd,
  SiteSchema,
  SitesCreate,
  SitesDelete,
  SitesList,
}

export type { Site }

export { commandToRoute, type HttpMethod } from './projection'

/**
 * Registry of every command, keyed by `name`. Used by:
 *   - `@unlighthouse/core/api/http`  — h3 route projection
 *   - `@unlighthouse/mcp`            — MCP tool registry
 *   - `unlighthouse` CLI             — citty subcommand generator
 *   - `@unlighthouse/contracts/client` — typed UI client
 *
 * CI parity tests iterate this map and assert that every command appears
 * on each enabled transport (modulo `mcp.hidden` / `cli.hidden`).
 */
export const commands = {
  'scan.start': ScanStart,
  'scan.status': ScanStatusCmd,
  'scan.cancel': ScanCancel,
  'scan.pause': ScanPause,
  'scan.resume': ScanResume,
  'scan.delete': ScanDelete,
  'scan.import': ScanImport,
  'scan.results': ScanResults,
  'scan.summary': ScanSummaryCmd,
  'scan.meta': ScanMetaCmd,
  'scan.current': ScanCurrent,
  'scan.rescanAll': ScanRescanAll,

  'route.get': RouteGet,
  'route.audits': RouteAudits,
  'route.rescan': RouteRescan,

  'scan.categories': ScanCategories,

  'history.list': HistoryList,
  'history.rescan': HistoryRescan,
  'history.prune': HistoryPrune,

  'compare.run': CompareRun,
  'compare.detail': CompareDetail,
  'compare.markdown': CompareMarkdown,
  'compare.findPrevious': CompareFindPrevious,

  'assert.evaluate': AssertEvaluate,

  'pack.run': PackRunCmd,
  'pack.list': PackList,

  'query.routes': QueryRoutes,

  'events.subscribe': EventsSubscribe,
  'events.tail': EventsTail,

  'manifest': Manifest,
  'health': Health,
  'ready': Ready,
  'auditors.list': AuditorsList,

  'sites.list': SitesList,
  'sites.create': SitesCreate,
  'sites.delete': SitesDelete,
} as const

export type CommandRegistry = typeof commands
export type CommandName = keyof CommandRegistry
