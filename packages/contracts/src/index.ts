// @unlighthouse/contracts — single entry.
// Internal organisation:
//   types/    — shared atoms + legacy interfaces (LighthouseReport, etc.)
//   hooks/    — UnlighthouseHooks HookMap + HookEventUnion
//   errors/   — UnlighthouseError + stable code constants
//   commands/ — Command<I,O> + defineCommand + the 22-command registry
//   config/   — UnlighthouseConfig validation schema (no defaults; D-011)
//   ports/    — SeedSource / Crawler / Auditor / Storage (separate agent)

export * from './commands/index'
export * from './config/index'
export * from './errors/index'
export * from './hooks/index'
export * from './packs/index'

// Ports: re-export everything EXCEPT placeholders that are now superseded by
// real types in `./config` (`UnlighthouseConfig`) and `./hooks` (`HookEvent`).
// The ports module is owned by a separate agent; we route around its
// placeholders here without modifying that file.
export * from './ports/auditor'
export type {
  CrawlSession,
  CrawlStats,
  CreateUnlighthouseCore,
  Logger,
  UnlighthouseCore,
  UnlighthouseCoreOptions,
  UnlighthouseCoreRunOptions,
  UnlighthouseCoreRunOverrides,
} from './ports/core'
export * from './ports/crawler'
export * from './ports/seed-source'
export * from './ports/storage'

// Atoms are the v1 vocabulary.
export * from './types/atoms'

export * from './types/dashboard'
// Legacy interfaces from `types/index.ts` are re-exported selectively to avoid
// name collisions with v1 atoms in `./config` (DiscoveryOptions) and
// `./hooks` (UnlighthouseHooks).
export type {
  Assertion,
  AssertionResult,
  AssertionType,
  ClientOptions,
  ClientOptionsPayload,
  ComputedLighthouseReportAudit,
  GenerateClientOptions,
  HookResult,
  HTMLExtractPayload,
  LighthouseCategories,
  LighthouseReport,
  LighthouseReportAudit,
  LighthouseReportCategory,
  NormalisedRoute,
  ReporterConfig,
  ResolvedUserConfig,
  RouteDefinition,
  RuntimeSettings,
  ScanMeta,
  UnlighthouseColumn,
  UnlighthouseInsights,
  UnlighthouseOptions,
  UnlighthouseProvider,
  UnlighthouseReport,
  UnlighthouseRouteReport,
  UnlighthouseTabs,
  UnlighthouseTask,
  UnlighthouseTaskStatus,
  UserConfig,
  ValidReportTypes,
  WS,
} from './types/index'

// Wire payloads shared by transport hooks and dashboard endpoints.
export * from './types/transport'
