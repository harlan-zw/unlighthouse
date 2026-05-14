// Command registry — source of truth projected to HTTP, MCP, CLI.
// See v1.md §"Command registry" (line 706).

import { AssertEvaluate } from './assert'
import { CompareFindPrevious, CompareMarkdown, CompareRun } from './compare'
import { EventsSubscribe, EventsTail } from './events'
import { HistoryDelete, HistoryGet, HistoryList, HistoryRescan } from './history'
import { AuditorsList, AuditorsTest, Health, Manifest } from './meta'
import { PackList, PackRunCmd } from './pack'
import { QueryRoutes } from './query'
import { RouteGet, RouteRescan } from './route'
import {
  ScanCancel,
  ScanCurrent,
  ScanDelete,
  ScanMetaCmd,
  ScanPause,
  ScanRescanAll,
  ScanResults,
  ScanResume,
  ScanStart,
  ScanStatusCmd,
  ScanSummaryCmd,
} from './scan'
import { Site, SitesCreate, SitesDelete, SitesGet, SitesList } from './sites'

export * from './compare'

export {
  AssertEvaluate,
  AuditorsList,
  AuditorsTest,
  CompareFindPrevious,
  CompareMarkdown,
  CompareRun,
  EventsSubscribe,
  EventsTail,
  Health,
  HistoryDelete,
  HistoryGet,
  HistoryList,
  HistoryRescan,
  Manifest,
  PackList,
  PackRunCmd,
  QueryRoutes,
  RouteGet,
  RouteRescan,
  ScanCancel,
  ScanCurrent,
  ScanDelete,
  ScanMetaCmd,
  ScanPause,
  ScanRescanAll,
  ScanResults,
  ScanResume,
  ScanStart,
  ScanStatusCmd,
  ScanSummaryCmd,
  Site,
  SitesCreate,
  SitesDelete,
  SitesGet,
  SitesList,
}

export * from './define'

/**
 * Registry of every command, keyed by `name`. Used by:
 *   - `@unlighthouse/core/api/http`  — h3 route projection
 *   - `@unlighthouse/mcp`            — MCP tool registry
 *   - `unlighthouse` CLI             — citty subcommand generator
 *   - `@unlighthouse/core/api/client`— typed UI client
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
  'scan.results': ScanResults,
  'scan.summary': ScanSummaryCmd,
  'scan.meta': ScanMetaCmd,
  'scan.current': ScanCurrent,
  'scan.rescanAll': ScanRescanAll,

  'route.get': RouteGet,
  'route.rescan': RouteRescan,

  'history.list': HistoryList,
  'history.get': HistoryGet,
  'history.delete': HistoryDelete,
  'history.rescan': HistoryRescan,

  'compare.run': CompareRun,
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
  'auditors.list': AuditorsList,
  'auditors.test': AuditorsTest,

  'sites.list': SitesList,
  'sites.get': SitesGet,
  'sites.create': SitesCreate,
  'sites.delete': SitesDelete,
} as const

export type CommandRegistry = typeof commands
export type CommandName = keyof CommandRegistry
