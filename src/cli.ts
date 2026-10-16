#!/usr/bin/env bun
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { ParseArgsConfig } from 'node:util'
import packageJson from '../package.json' with { type: 'json' }
import { toJUnit } from './analysis/junit.ts'
import { toMarkdown } from './analysis/markdown.ts'
import type { ScanSummary } from './analysis/summary.ts'
import { describeWarning } from './analysis/summary.ts'
import { captureLogin } from './audit/auth.ts'
import { doctor } from './audit/doctor.ts'
import { FLOW_WORKER_COMMAND, flowJobFor, runFlow } from './audit/flow.ts'
import { WORKER_COMMAND } from './audit/pool.ts'
import type { Config, ConfigInput } from './config.ts'
import { loadConfigFile, mergeConfig, parseConfig } from './config.ts'
import type { FlowRunResult, RunFlow, Store } from './contracts.ts'
import { openStore } from './db/index.ts'
import { UnlighthouseError, toErrorPayload } from './errors.ts'
import { EventBus } from './events.ts'
import type { UnlighthouseEvent } from './events.ts'
import { serveMcp } from './mcp/server.ts'
import { analyzeScan, budgetReport, publicScan, scanBudgets } from './ops/analysis.ts'
import { scheduleOverridesSchema } from './ops/monitoring.ts'
import { operations, startInput } from './ops/operations.ts'
import type { OperationContext } from './ops/registry.ts'
import { invoke, parseInput } from './ops/registry.ts'
import type { Notifier } from './scan/notify.ts'
import { createNotifier } from './scan/notify.ts'
import type { Scanner, ScannerOptions, ScanInput } from './scan/runner.ts'
import { createScanner } from './scan/runner.ts'
import { createScheduler, syncSchedules } from './scan/scheduler.ts'
import { createServer, renderFlowReport } from './server/app.ts'
import { exportCsv, exportScan } from './server/export.ts'
import { openRemoteSync } from './sync/remote.ts'
import { CATEGORIES, METRICS } from './types.ts'
import type { Category, Delivery, Metric, NotificationChannel, Scan, Schedule } from './types.ts'

export interface Output {
  write(text: string): unknown
  isTTY?: boolean
}

export interface CliDeps {
  createPool?: ScannerOptions['createPool']
  discover?: ScannerOptions['discover']
  captureLogin?: ScannerOptions['captureLogin']
  runFlow?: RunFlow
  stdout?: Output
  stderr?: Output
  env?: Record<string, string | undefined>
  cwd?: string
  handleSignals?: boolean
}

interface Context {
  cwd: string
  env: Record<string, string | undefined>
  out: Output
  err: Output
  deps: CliDeps
}

class UsageError extends Error {}

const VERSION = packageJson.version

const HELP = `Unlighthouse ${VERSION} — scan a whole website with Lighthouse

Usage: unlighthouse <command> [options]

Commands:
  scan <url>               Discover and audit a site, then print a summary
  serve                    Start the dashboard and API (default http://127.0.0.1:5678)
  ci <url>                 Scan, compare with the baseline, check budgets, write reports
  compare <base> <head>    Diff two scans by id (JSON, or Markdown with --markdown)
  export <scan>            Write a static report folder that opens without a server
  flow <module> --url <u>  Run one Lighthouse user flow ad hoc and print its steps
  doctor                   Check Chrome, Bun, Lighthouse and the data directory
  prune --keep <n>         Keep only the newest n finished scans per site
  config --print           Print the resolved config as JSON
  mcp                      Run the MCP server on stdio (for AI agents)
  schedule list            List scheduled scans (unlighthouse serve runs them)
  schedule add <url> --cron <expr>  Scan a site on a cron timetable (scan options apply)
  schedule remove <id>     Delete a schedule
  schedule run <id>        Run a schedule's scan now and print its summary
  notify list              List notification channels
  notify test <id>         Send a test message to a notification channel

Common options:
  -c, --config <file>      Config file (default unlighthouse.config.ts in the current directory)
      --data-dir <dir>     Data directory (default .unlighthouse)
      --json               Machine-readable output
  -h, --help               Show help
  -v, --version            Show the version

Scan options (scan, ci, config):
  -d, --device <name>      mobile and/or desktop; repeat or comma-separate
      --url <path>         Audit these paths or URLs instead of discovering; repeatable
      --max-pages <n>      Stop discovery after n pages
      --per-template <n>   Pages audited per template (0 = all)
      --max-audits <n>     Upper bound on audited pages per device
      --samples <n>        Lighthouse runs per page; the median is kept
      --concurrency <n>    Parallel Lighthouse runs (default keeps performance scores stable)
      --throttling <mode>  simulate | devtools | none
      --category <name>    Lighthouse category; repeatable
      --include <glob>     Only keep matching paths; repeatable
      --exclude <glob>     Drop matching paths; repeatable
      --render             Render pages in Chrome during discovery (client-rendered sites)
      --label <text>       Label for the scan

schedule add options:
      --cron <expr>        minute hour day month weekday, e.g. "0 3 * * *"; at least 15 minutes apart
      --id <id>            Schedule id (default derived from the URL and cron)
      --disabled           Create the schedule without running it

serve options:
      --port <n>           Port (default 5678)
      --host <host>        Interface to bind (default 127.0.0.1)
      --allow-host <name>  Extra Host header to accept; repeatable

ci options:
      --branch <name>      Branch (default GITHUB_HEAD_REF or GITHUB_REF_NAME)
      --commit <sha>       Commit (default GITHUB_SHA)
      --baseline-branch <name>  Prefer baselines from this branch (default GITHUB_BASE_REF)
      --markdown <file>    Write the Markdown report
      --json <file>        Write the JSON report
      --junit <file>       Write budget results as JUnit XML
      --budgets <file>     Budgets as JSON (same shape as the budgets config key)
      --export <dir>       Also write the static report (see export)
  Exit codes: 0 pass, 1 budget failure, 2 scan failure.

flow options:
      --url <url>          Start URL passed to the flow (default: site from config)
      --name <name>        Flow name (default: the module file name)
      --timeout <ms>       Hard limit for the flow (default timeoutMs)
      --report <file>      Write Lighthouse's flow HTML report (one per device)
  Also takes --device, --category and --throttling.

export options:
      --out <dir>          Output folder (default ./unlighthouse-report). Only an empty folder
                           or a previous Unlighthouse export is replaced.
      --no-reports         Leave out the per-page Lighthouse HTML reports
      --format <fmt>       html (static report, default) or csv (pages.csv and
                           issues.csv, see docs/export.md)
      --bom                Start CSV files with a UTF-8 byte order mark (Excel)
`

const COMMON = {
  'config': { type: 'string', short: 'c' },
  'data-dir': { type: 'string' },
  'json': { type: 'boolean' },
  'help': { type: 'boolean', short: 'h' },
} as const satisfies ParseArgsConfig['options']

const SCAN = {
  'device': { type: 'string', short: 'd', multiple: true },
  'url': { type: 'string', multiple: true },
  'max-pages': { type: 'string' },
  'per-template': { type: 'string' },
  'max-audits': { type: 'string' },
  'samples': { type: 'string' },
  'concurrency': { type: 'string' },
  'throttling': { type: 'string' },
  'category': { type: 'string', multiple: true },
  'include': { type: 'string', multiple: true },
  'exclude': { type: 'string', multiple: true },
  'render': { type: 'boolean' },
  'label': { type: 'string' },
} as const satisfies ParseArgsConfig['options']

type Values = Record<string, string | boolean | string[] | undefined>

function parse(args: string[], options: ParseArgsConfig['options']): { values: Values, positionals: string[] } {
  try {
    const { values, positionals } = parseArgs({ args, options: options!, allowPositionals: true, strict: true })
    return { values: values as Values, positionals }
  }
  catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
}

function str(values: Values, name: string): string | undefined {
  const value = values[name]
  return typeof value === 'string' ? value : undefined
}

function list(values: Values, name: string): string[] | undefined {
  const value = values[name]
  if (!Array.isArray(value))
    return undefined
  return value.flatMap(item => item.split(',')).map(item => item.trim()).filter(Boolean)
}

function int(values: Values, name: string): number | undefined {
  const value = str(values, name)
  if (value === undefined)
    return undefined
  if (!/^\d+$/.test(value))
    throw new UsageError(`--${name} expects a whole number, got "${value}"`)
  return Number(value)
}

function scanOverrides(values: Values, site: string | undefined): ConfigInput {
  const discover: Record<string, unknown> = {}
  const sampling: Record<string, unknown> = {}
  const maxPages = int(values, 'max-pages')
  if (maxPages !== undefined)
    discover['maxPages'] = maxPages
  if (values['render'])
    discover['render'] = true
  const include = list(values, 'include')
  if (include)
    discover['include'] = include
  const exclude = list(values, 'exclude')
  if (exclude)
    discover['exclude'] = exclude
  const perTemplate = int(values, 'per-template')
  if (perTemplate !== undefined)
    sampling['perTemplate'] = perTemplate
  const maxAudits = int(values, 'max-audits')
  if (maxAudits !== undefined)
    sampling['maxAudits'] = maxAudits
  const out: Record<string, unknown> = {
    site,
    devices: list(values, 'device'),
    urls: list(values, 'url'),
    samples: int(values, 'samples'),
    concurrency: int(values, 'concurrency'),
    throttling: str(values, 'throttling'),
    categories: list(values, 'category'),
    dataDir: str(values, 'data-dir'),
  }
  if (Object.keys(discover).length)
    out['discover'] = discover
  if (Object.keys(sampling).length)
    out['sampling'] = sampling
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined)) as ConfigInput
}

async function resolveConfig(ctx: Context, values: Values, overrides: ConfigInput): Promise<{ file: ConfigInput, config: Config }> {
  const { config: file } = await loadConfigFile(ctx.cwd, str(values, 'config'))
  const config = parseConfig(mergeConfig(mergeConfig({}, file as Record<string, unknown>), overrides as Record<string, unknown>))
  return { file, config: { ...config, dataDir: resolve(ctx.cwd, config.dataDir) } }
}

interface Engine {
  store: Store
  bus: EventBus
  scanner: Scanner
  notifier: Notifier
  close(): Promise<void>
}

function openEngine(ctx: Context, file: ConfigInput, config: Config): Engine {
  const store = openStore(config.dataDir)
  const bus = new EventBus()
  const { schedules: _schedules, notifications: _notifications, publicUrl: _publicUrl, ...scanFile } = file
  const notifier = createNotifier({
    store,
    bus,
    env: ctx.env,
    channels: config.notifications ?? [],
    ...(config.publicUrl ? { publicUrl: config.publicUrl } : {}),
  })
  const scanner = createScanner({
    store,
    bus,
    config: { ...scanFile, dataDir: config.dataDir },
    lockPath: join(config.dataDir, 'scanner.lock'),
    env: ctx.env,
    ...(ctx.deps.createPool ? { createPool: ctx.deps.createPool } : {}),
    ...(ctx.deps.discover ? { discover: ctx.deps.discover } : {}),
    ...(ctx.deps.captureLogin ? { captureLogin: ctx.deps.captureLogin } : {}),
    ...(ctx.deps.runFlow ? { runFlow: ctx.deps.runFlow } : {}),
  })
  return {
    store,
    bus,
    scanner,
    notifier,
    async close() {
      await scanner.close()
      await notifier.close()
      store.close()
    },
  }
}

function onInterrupt(ctx: Context, handler: (count: number) => void): () => void {
  if (ctx.deps.handleSignals === false)
    return () => {}
  let count = 0
  const listener = () => handler(++count)
  process.on('SIGINT', listener)
  process.on('SIGTERM', listener)
  return () => {
    process.off('SIGINT', listener)
    process.off('SIGTERM', listener)
  }
}

function localPath(url: string, origin: string): string {
  return url.startsWith(origin) ? url.slice(origin.length) || '/' : url
}

function percent(score: number | null | undefined): string {
  return score === null || score === undefined ? '–' : String(Math.round(score * 100))
}

function progressReporter(ctx: Context, scan: Scan): (event: UnlighthouseEvent) => void {
  const tty = Boolean(ctx.err.isTTY)
  let status = scan.status
  let line = ''
  const show = (text: string) => {
    if (tty) {
      line = text
      ctx.err.write(`\r\x1B[2K${text}`)
    }
  }
  const say = (text: string) => {
    if (tty && line)
      ctx.err.write('\r\x1B[2K')
    ctx.err.write(`${text}\n`)
    if (tty && line)
      ctx.err.write(line)
  }
  return (event) => {
    if (!('scanId' in event) || event.scanId !== scan.id)
      return
    switch (event.type) {
      case 'scan:status':
        status = event.status
        if (tty && (status === 'done' || status === 'failed' || status === 'cancelled')) {
          ctx.err.write('\r\x1B[2K')
          line = ''
        }
        if (!tty || status === 'failed')
          say(`${status}${event.error ? `: ${event.error}` : ''}`)
        break
      case 'scan:progress': {
        if (status === 'discovering') {
          show(`Discovering pages… ${event.discovered} found`)
          break
        }
        const total = event.queued + event.done + event.failed
        show(`Auditing ${event.done + event.failed}/${total}${event.failed ? ` · ${event.failed} failed` : ''}${event.skipped ? ` · ${event.skipped} skipped by sampling` : ''} · ${event.discovered} page(s) found`)
        break
      }
      case 'page:status':
        if (event.status === 'done' && !tty)
          say(`  done  ${event.device.padEnd(7)} ${localPath(event.url, scan.origin)}  performance ${percent(event.score)}`)
        else if (event.status === 'failed')
          say(`  FAIL  ${event.device.padEnd(7)} ${localPath(event.url, scan.origin)}  ${event.error ?? ''}`)
        break
      case 'log':
        if (event.level !== 'info' || !tty)
          say(`${event.level === 'info' ? '' : `${event.level}: `}${event.message}`)
        break
    }
  }
}

const SHORT: Record<Category, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'best-practices': 'Best practices',
  'seo': 'SEO',
  'agentic-browsing': 'Agentic',
}

function metricText(metric: Metric, value: number): string {
  if (metric === 'cls')
    return value.toFixed(3)
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
}

export function formatSummary(summary: ScanSummary): string {
  const { scan, pages } = summary
  const lines = [
    `Unlighthouse · ${scan.origin} · scan ${scan.id}`,
    `Status ${scan.status}${scan.lighthouseVersion ? ` · Lighthouse ${scan.lighthouseVersion}` : ''} · ${pages.discovered} page(s) found, ${pages.audited} audited, ${pages.skippedBySampling} skipped, ${pages.failed} failed`,
    '',
  ]
  for (const device of summary.devices) {
    lines.push(`${device.device}  ${CATEGORIES.map(category => `${SHORT[category]} ${percent(device.scores.mean[category])}`).join(' · ')}`)
    const p75 = METRICS.filter(metric => device.p75[metric] !== undefined).map(metric => `${metric.toUpperCase()} ${metricText(metric, device.p75[metric]!)}`)
    if (p75.length)
      lines.push(`  p75 ${p75.join(' · ')}`)
    for (const template of device.worstTemplates)
      lines.push(`  slowest template ${template.template} (${template.pages} page(s)) performance ${percent(template.meanPerformance)}`)
  }
  if (summary.topIssues.length) {
    lines.push('', `Top issues (${summary.issueCount} in total):`)
    for (const issue of summary.topIssues)
      lines.push(`  - ${issue.title}${issue.items > 1 ? `, ${issue.items} resources` : issue.topItem ? ` — ${issue.topItem}` : ''} (${issue.pages} page(s))`)
  }
  if (summary.brokenLinks)
    lines.push('', `${summary.brokenLinks} broken link(s)`)
  if (summary.baseline) {
    const { pages: changed, issues } = summary.baseline
    lines.push('', `Since ${summary.baseline.scanId}: ${changed.regressed} regressed, ${changed.improved} improved${changed.failed ? `, ${changed.failed} now failing` : ''}, ${issues.new} new issue(s), ${issues.fixed} fixed`)
  }
  for (const warning of summary.warnings)
    lines.push(`warning: ${describeWarning(warning)}`)
  return `${lines.join('\n')}\n`
}

async function runToEnd(ctx: Context, engine: Engine, input: ScanInput | (() => Scan)): Promise<{ scan: Scan, interrupted: boolean }> {
  const started = typeof input === 'function' ? input() : engine.scanner.start(input)
  const off = engine.bus.on(progressReporter(ctx, started))
  let interrupted = false
  const dispose = onInterrupt(ctx, (count) => {
    interrupted = true
    if (count > 1) {
      ctx.err.write('\nForced exit\n')
      process.exit(130)
    }
    ctx.err.write('\nCancelling the scan… (press Ctrl+C again to force)\n')
    engine.scanner.cancel(started.id).catch(() => {})
  })
  try {
    const scan = await engine.scanner.wait(started.id, 2 ** 31 - 1)
    await engine.scanner.idle()
    return { scan: engine.store.getScan(scan.id) ?? scan, interrupted }
  }
  finally {
    dispose()
    off()
  }
}

async function commandScan(ctx: Context, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, { ...COMMON, ...SCAN })
  if (positionals.length > 1)
    throw new UsageError('scan takes one URL')
  const overrides = scanOverrides(values, positionals[0])
  const { file, config } = await resolveConfig(ctx, values, overrides)
  if (!config.site)
    throw new UsageError('scan needs a URL: unlighthouse scan https://example.com')
  const engine = openEngine(ctx, file, config)
  try {
    const label = str(values, 'label')
    const { scan, interrupted } = await runToEnd(ctx, engine, { ...overrides, ...(label ? { label } : {}) })
    const summary = analyzeScan(engine.store, scan.id).summary
    if (values['json'])
      ctx.out.write(`${JSON.stringify({ scan: publicScan(scan), summary }, null, 2)}\n`)
    else
      ctx.out.write(formatSummary(summary) + (scan.error ? `\nerror: ${scan.error}\n` : ''))
    if (scan.status === 'done')
      return 0
    return interrupted ? 130 : 2
  }
  finally {
    await engine.close()
  }
}

function writeOutput(ctx: Context, path: string | undefined, content: string): void {
  if (!path)
    return
  const target = resolve(ctx.cwd, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function readBudgets(path: string): NonNullable<ConfigInput['budgets']> {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  }
  catch (error) {
    throw new UsageError(`Cannot read the budgets file ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    return JSON.parse(text) as NonNullable<ConfigInput['budgets']>
  }
  catch (error) {
    throw new UsageError(`The budgets file ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function commandCi(ctx: Context, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, {
    ...COMMON,
    ...SCAN,
    'json': { type: 'string' },
    'markdown': { type: 'string' },
    'junit': { type: 'string' },
    'branch': { type: 'string' },
    'commit': { type: 'string' },
    'baseline-branch': { type: 'string' },
    'export': { type: 'string' },
    'budgets': { type: 'string' },
  })
  if (positionals.length > 1)
    throw new UsageError('ci takes one URL')
  const overrides = scanOverrides(values, positionals[0])
  const budgetsFile = str(values, 'budgets')
  if (budgetsFile)
    overrides.budgets = readBudgets(resolve(ctx.cwd, budgetsFile))
  const { file, config } = await resolveConfig(ctx, values, overrides)
  if (!config.site)
    throw new UsageError('ci needs a URL: unlighthouse ci https://example.com')
  const env = ctx.env
  const branch = str(values, 'branch') ?? (env['GITHUB_HEAD_REF'] || env['GITHUB_REF_NAME'] || undefined)
  const commit = str(values, 'commit') ?? (env['GITHUB_SHA'] || undefined)
  const baselineBranch = str(values, 'baseline-branch') ?? (env['GITHUB_BASE_REF'] || undefined)
  const label = str(values, 'label')
  const engine = openEngine(ctx, file, config)
  try {
    const { scan } = await runToEnd(ctx, engine, {
      ...overrides,
      ...(label ? { label } : {}),
      ...(branch ? { branch } : {}),
      ...(commit ? { commit } : {}),
    })
    if (scan.status !== 'done') {
      ctx.err.write(`Scan ${scan.id} ${scan.status}${scan.error ? `: ${scan.error}` : ''}\n`)
      return 2
    }
    const analysis = analyzeScan(engine.store, scan.id, { baselineBranch: baselineBranch ?? null })
    const budgets = budgetReport(analysis, scanBudgets(scan))
    const markdown = toMarkdown({ summary: analysis.summary, budgets, ...(analysis.comparison ? { comparison: analysis.comparison } : {}) })
    const report = {
      scan: publicScan(scan),
      summary: analysis.summary,
      budgets,
      baseline: analysis.baseline?.id ?? null,
      ...(analysis.comparison ? { comparison: analysis.comparison } : {}),
    }
    writeOutput(ctx, str(values, 'markdown'), markdown)
    writeOutput(ctx, str(values, 'json'), `${JSON.stringify(report, null, 2)}\n`)
    writeOutput(ctx, str(values, 'junit'), toJUnit(budgets))
    const exportDir = str(values, 'export')
    if (exportDir) {
      const exported = await exportScan({ store: engine.store, scanId: scan.id, out: resolve(ctx.cwd, exportDir), version: VERSION })
      ctx.err.write(`Static report: ${exported.dir}\n`)
    }
    const stepSummary = env['GITHUB_STEP_SUMMARY']
    if (stepSummary)
      appendFileSync(stepSummary, `${markdown}\n`)
    ctx.out.write(markdown)
    if (!budgets.passed) {
      ctx.err.write(`Budgets failed: ${budgets.results.filter(result => !result.passed).map(result => `${result.rule} [${result.scope}]`).join(', ')}\n`)
      return 1
    }
    return 0
  }
  finally {
    await engine.close()
  }
}

async function commandServe(ctx: Context, args: string[]): Promise<number> {
  const { values } = parse(args, {
    ...COMMON,
    'port': { type: 'string' },
    'host': { type: 'string' },
    'allow-host': { type: 'string', multiple: true },
  })
  const { file, config } = await resolveConfig(ctx, values, scanOverrides(values, undefined))
  const remote = ctx.env['UNLIGHTHOUSE_SYNC']
    ? await openRemoteSync({
        dataDir: config.dataDir,
        url: ctx.env['UNLIGHTHOUSE_SYNC'],
        ...(ctx.env['UNLIGHTHOUSE_SYNC_TOKEN'] ? { token: ctx.env['UNLIGHTHOUSE_SYNC_TOKEN'] } : {}),
        log: line => ctx.err.write(`${line}\n`),
      })
    : null
  const engine = openEngine(ctx, file, config)
  remote?.watch(engine.bus)
  syncSchedules(engine.store, config.schedules ?? [], parseOverrides)
  const resumed = engine.scanner.recover()
  const scheduler = createScheduler({ store: engine.store, scanner: engine.scanner, bus: engine.bus })
  const server = createServer({
    store: engine.store,
    scanner: engine.scanner,
    bus: engine.bus,
    host: str(values, 'host') ?? '127.0.0.1',
    port: int(values, 'port') ?? 5678,
    allowedHosts: list(values, 'allow-host') ?? [],
    development: Boolean(ctx.env['UNLIGHTHOUSE_DEV']),
    scheduler,
    notifier: engine.notifier,
    ...(ctx.env['UNLIGHTHOUSE_TOKEN'] ? { token: ctx.env['UNLIGHTHOUSE_TOKEN'] } : {}),
  })
  if (server.exposed)
    ctx.err.write(`warning: Unlighthouse is listening on ${server.host}, reachable from other machines. Requests still need the token; share the URL below only with people you trust.\n`)
  if (resumed.length)
    ctx.err.write(`Resuming ${resumed.length} interrupted scan(s)\n`)
  const started = scheduler.start()
  const active = engine.store.listSchedules().filter(schedule => schedule.enabled).length
  if (active)
    ctx.err.write(`${active} schedule(s) active${started.length ? `; started ${started.length} run(s) missed while Unlighthouse was stopped` : ''}\n`)
  ctx.out.write(`Unlighthouse dashboard: ${server.loginUrl}\n`)
  ctx.out.write(`Data: ${config.dataDir}\n`)
  await new Promise<void>((done) => {
    const dispose = onInterrupt(ctx, () => {
      dispose()
      done()
    })
  })
  ctx.err.write('Stopping…\n')
  scheduler.stop()
  await server.stop()
  await engine.close()
  await remote?.close()
  return 0
}

async function commandMcp(ctx: Context, args: string[]): Promise<number> {
  const { values } = parse(args, COMMON)
  const { file, config } = await resolveConfig(ctx, values, scanOverrides(values, undefined))
  const engine = openEngine(ctx, file, config)
  engine.scanner.recover()
  const log = (message: string) => {
    ctx.err.write(`unlighthouse mcp: ${message}\n`)
  }
  log(`ready (data ${config.dataDir})`)
  try {
    await serveMcp({ store: engine.store, scanner: engine.scanner, notifier: engine.notifier, version: VERSION, log, write: line => ctx.out.write(line) })
  }
  finally {
    await engine.close()
  }
  return 0
}

async function commandCompare(ctx: Context, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, { ...COMMON, markdown: { type: 'boolean' } })
  if (positionals.length !== 2)
    throw new UsageError('compare takes two scan ids: unlighthouse compare <base> <head>')
  const [base, head] = positionals as [string, string]
  const { config } = await resolveConfig(ctx, values, scanOverrides(values, undefined))
  const store = openStore(config.dataDir)
  try {
    const comparison = await invoke(operations, { store, scanner: unavailableScanner() }, 'compare', { base, head }) as NonNullable<ReturnType<typeof analyzeScan>['comparison']>
    if (values['markdown'])
      ctx.out.write(toMarkdown({ summary: analyzeScan(store, head).summary, comparison }))
    else
      ctx.out.write(`${JSON.stringify(comparison, null, 2)}\n`)
    return 0
  }
  finally {
    store.close()
  }
}

async function commandExport(ctx: Context, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, { ...COMMON, 'out': { type: 'string', short: 'o' }, 'no-reports': { type: 'boolean' }, 'format': { type: 'string' }, 'bom': { type: 'boolean' } })
  if (positionals.length !== 1)
    throw new UsageError('export takes one scan id: unlighthouse export <scanId> [--out dir]')
  const format = str(values, 'format') ?? 'html'
  if (format !== 'html' && format !== 'csv')
    throw new UsageError(`--format expects html or csv, got "${format}"`)
  const { config } = await resolveConfig(ctx, values, scanOverrides(values, undefined))
  const store = openStore(config.dataDir)
  try {
    if (format === 'csv') {
      const result = exportCsv({ store, scanId: positionals[0]!, out: resolve(ctx.cwd, str(values, 'out') ?? 'unlighthouse-report'), bom: Boolean(values['bom']) })
      if (values['json'])
        ctx.out.write(`${JSON.stringify(result, null, 2)}\n`)
      else
        ctx.out.write(`Exported scan ${result.scanId}: ${result.files.join(', ')}\n`)
      return 0
    }
    const result = await exportScan({
      store,
      scanId: positionals[0]!,
      out: resolve(ctx.cwd, str(values, 'out') ?? 'unlighthouse-report'),
      reports: !values['no-reports'],
      version: VERSION,
    })
    if (values['json'])
      ctx.out.write(`${JSON.stringify(result, null, 2)}\n`)
    else
      ctx.out.write(`Exported scan ${result.scanId}: ${result.pages} page row(s), ${result.reports} Lighthouse report(s)${result.flows ? `, ${result.flows} flow run(s)` : ''}\nOpen ${join(result.dir, 'index.html')}\n`)
    return 0
  }
  finally {
    store.close()
  }
}

function formatFlow(result: FlowRunResult): string {
  const lines = [`Flow ${result.name} (${result.device}) · ${result.steps.length} step(s) · ${(result.durationMs / 1000).toFixed(1)} s · Lighthouse ${result.lighthouseVersion}`]
  result.steps.forEach((step, index) => {
    const parts: string[] = []
    if (step.scores.performance !== null)
      parts.push(`${step.mode === 'navigation' ? 'Performance' : 'Performance audits passed'} ${percent(step.scores.performance)}`)
    for (const metric of ['inp', 'tbt', 'cls', 'lcp', 'fcp'] as const) {
      const value = step.metrics[metric]
      if (value !== null)
        parts.push(`${metric.toUpperCase()} ${metric === 'inp' ? `${Math.round(value)} ms` : metricText(metric, value)}`)
    }
    if (step.findings.length)
      parts.push(`${step.findings.length} finding(s)`)
    lines.push(`  ${index + 1}. ${step.mode.padEnd(10)} ${step.name}${parts.length ? `  ${parts.join(' · ')}` : ''}`)
    for (const warning of step.warnings)
      lines.push(`     warning: ${warning}`)
  })
  return `${lines.join('\n')}\n`
}

function deviceReportPath(path: string, device: string, many: boolean): string {
  if (!many)
    return path
  const extension = extname(path)
  return `${path.slice(0, path.length - extension.length)}-${device}${extension || '.html'}`
}

async function commandFlow(ctx: Context, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, {
    ...COMMON,
    'device': SCAN.device,
    'category': SCAN.category,
    'throttling': SCAN.throttling,
    'url': { type: 'string' },
    'name': { type: 'string' },
    'timeout': { type: 'string' },
    'report': { type: 'string' },
  })
  if (positionals.length !== 1)
    throw new UsageError('flow takes one module: unlighthouse flow ./flows/search.ts --url https://example.com')
  const module = resolve(ctx.cwd, positionals[0]!)
  const overrides = scanOverrides({ device: values['device'], category: values['category'], throttling: values['throttling'] }, undefined)
  const { config } = await resolveConfig(ctx, values, overrides)
  const url = str(values, 'url') ?? config.site
  if (!url)
    throw new UsageError('flow needs a start URL: --url https://example.com')
  const timeoutMs = int(values, 'timeout')
  const flow = { name: str(values, 'name') ?? basename(module, extname(module)), module, url, ...(timeoutMs ? { timeoutMs } : {}) }
  const site = config.site ?? new URL(url).origin
  const login = ctx.deps.captureLogin ?? ((loginConfig: Config, signal?: AbortSignal) => captureLogin(loginConfig, ctx.cwd, signal))
  const controller = new AbortController()
  const dispose = onInterrupt(ctx, () => controller.abort())
  const run = ctx.deps.runFlow ?? runFlow
  const results: FlowRunResult[] = []
  let failed = 0
  try {
    const auth = await login({ ...config, site }, AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeoutMs)]))
    for (const device of config.devices) {
      try {
        const result = await run(flowJobFor({ ...config, site }, flow, device, auth, ctx.cwd), controller.signal)
        results.push(result)
        if (!values['json'])
          ctx.out.write(formatFlow(result))
        const report = str(values, 'report')
        if (report) {
          const target = resolve(ctx.cwd, deviceReportPath(report, device, config.devices.length > 1))
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, renderFlowReport(result.report))
          ctx.err.write(`Flow report: ${target}\n`)
        }
      }
      catch (error) {
        if (controller.signal.aborted)
          return 130
        failed++
        ctx.err.write(`Flow ${flow.name} (${device}) failed: ${toErrorPayload(error).message}\n`)
      }
    }
  }
  finally {
    dispose()
  }
  if (values['json'])
    ctx.out.write(`${JSON.stringify(results.map(({ report: _report, ...result }) => result), null, 2)}\n`)
  return failed ? 2 : 0
}

function unavailableScanner(): Scanner {
  const fail = () => {
    throw new UnlighthouseError('SCAN_NOT_RUNNING', 'This command does not run scans')
  }
  return {
    start: fail,
    cancel: fail,
    rescanPage: fail,
    wait: fail,
    recover: () => [],
    active: () => null,
    idle: async () => {},
    close: async () => {},
  }
}

async function commandDoctor(ctx: Context, args: string[]): Promise<number> {
  const { values } = parse(args, COMMON)
  const { config } = await resolveConfig(ctx, values, scanOverrides(values, undefined))
  const report = await doctor(config)
  if (values['json']) {
    ctx.out.write(`${JSON.stringify(report, null, 2)}\n`)
  }
  else {
    for (const check of report.checks) {
      ctx.out.write(`[${check.status}] ${check.label}: ${check.detail}\n`)
      if (check.fix)
        ctx.out.write(`       ${check.fix}\n`)
    }
    ctx.out.write(report.ok ? 'Ready to scan.\n' : 'Fix the failed checks before scanning.\n')
  }
  return report.ok ? 0 : 1
}

async function commandPrune(ctx: Context, args: string[]): Promise<number> {
  const { values } = parse(args, { ...COMMON, keep: { type: 'string' }, site: { type: 'string' } })
  const keep = int(values, 'keep')
  if (keep === undefined)
    throw new UsageError('prune needs --keep <n>')
  const { config } = await resolveConfig(ctx, values, scanOverrides(values, undefined))
  const store = openStore(config.dataDir)
  try {
    const site = str(values, 'site')
    const origins = site ? [new URL(site).origin] : store.listSites().map(item => item.origin)
    const removed = origins.flatMap(origin => store.pruneScans(origin, keep))
    if (values['json'])
      ctx.out.write(`${JSON.stringify({ removed }, null, 2)}\n`)
    else
      ctx.out.write(`Removed ${removed.length} scan(s)${removed.length ? `: ${removed.join(', ')}` : ''}\n`)
    return 0
  }
  finally {
    store.close()
  }
}

async function commandConfig(ctx: Context, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, { ...COMMON, ...SCAN, print: { type: 'boolean' } })
  const { config } = await resolveConfig(ctx, values, scanOverrides(values, positionals[0]))
  ctx.out.write(`${JSON.stringify(config, null, 2)}\n`)
  return 0
}

function parseOverrides(raw: unknown): Record<string, unknown> {
  const result = scheduleOverridesSchema(startInput).safeParse(raw)
  if (!result.success)
    throw new UnlighthouseError('INVALID_CONFIG', `Invalid schedule overrides: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  return result.data
}

function when(ms: number | null): string {
  return ms === null ? '–' : `${new Date(ms).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

async function commandSchedule(ctx: Context, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, {
    ...COMMON,
    ...SCAN,
    'cron': { type: 'string' },
    'id': { type: 'string' },
    'disabled': { type: 'boolean' },
  })
  const [action, target, ...extra] = positionals
  if (extra.length)
    throw new UsageError(`Unexpected arguments: ${extra.join(' ')}`)
  if (!['list', 'add', 'remove', 'run'].includes(action ?? ''))
    throw new UsageError('Usage: unlighthouse schedule list | add <url> --cron <expr> | remove <id> | run <id>')
  if (action !== 'list' && !target)
    throw new UsageError(action === 'add' ? 'schedule add needs a URL: unlighthouse schedule add https://example.com --cron "0 3 * * *"' : `schedule ${action} needs a schedule id`)
  const { file, config } = await resolveConfig(ctx, values, scanOverrides(values, undefined))
  const engine = openEngine(ctx, file, config)
  const opCtx: OperationContext = { store: engine.store, scanner: engine.scanner, notifier: engine.notifier }
  const json = Boolean(values['json'])
  try {
    if (action === 'list') {
      const schedules = await invoke(operations, opCtx, 'schedules.list', {}) as Schedule[]
      if (json)
        ctx.out.write(`${JSON.stringify(schedules, null, 2)}\n`)
      else if (!schedules.length)
        ctx.out.write('No schedules. Add one with unlighthouse schedule add <url> --cron "0 3 * * *"\n')
      for (const schedule of json ? [] : schedules)
        ctx.out.write(`${schedule.id}  ${schedule.site}  "${schedule.cron}"  ${schedule.enabled ? 'enabled' : 'disabled'}  ${schedule.source}  next ${when(schedule.nextRunAt)}  last ${when(schedule.lastRunAt)}${schedule.lastError ? `  error: ${schedule.lastError}` : ''}\n`)
      return 0
    }
    if (action === 'add') {
      const cron = str(values, 'cron')
      if (!cron)
        throw new UsageError('schedule add needs --cron, e.g. --cron "0 3 * * *"')
      const { site: _site, devices, dataDir: _dataDir, ...overrides } = scanOverrides(values, target)
      const label = str(values, 'label')
      const id = str(values, 'id')
      const schedule = await invoke(operations, opCtx, 'schedules.create', {
        site: target,
        cron,
        ...(id ? { id } : {}),
        ...(devices ? { devices } : {}),
        overrides: { ...overrides, ...(label ? { label } : {}) },
        enabled: !values['disabled'],
      }) as Schedule
      ctx.out.write(json ? `${JSON.stringify(schedule, null, 2)}\n` : `Added schedule ${schedule.id}; next run ${when(schedule.nextRunAt)}. unlighthouse serve runs it.\n`)
      return 0
    }
    if (action === 'remove') {
      await invoke(operations, opCtx, 'schedules.delete', { id: target })
      ctx.out.write(json ? `${JSON.stringify({ deleted: target })}\n` : `Removed schedule ${target}\n`)
      return 0
    }
    const operation = operations.find(candidate => candidate.name === 'schedules.runNow')!
    const input = parseInput(operation, { id: target })
    const { scan, interrupted } = await runToEnd(ctx, engine, () => (operation.handler(opCtx, input) as { scan: Scan }).scan)
    const summary = analyzeScan(engine.store, scan.id).summary
    if (json)
      ctx.out.write(`${JSON.stringify({ scan: publicScan(scan), summary }, null, 2)}\n`)
    else
      ctx.out.write(formatSummary(summary) + (scan.error ? `\nerror: ${scan.error}\n` : ''))
    if (scan.status === 'done')
      return 0
    return interrupted ? 130 : 2
  }
  finally {
    await engine.close()
  }
}

async function commandNotify(ctx: Context, args: string[]): Promise<number> {
  const { values, positionals } = parse(args, COMMON)
  const [action, target, ...extra] = positionals
  if (extra.length)
    throw new UsageError(`Unexpected arguments: ${extra.join(' ')}`)
  if (action !== 'list' && action !== 'test')
    throw new UsageError('Usage: unlighthouse notify list | test <id>')
  if (action === 'test' && !target)
    throw new UsageError('notify test needs an id: unlighthouse notify test <id>')
  const { file, config } = await resolveConfig(ctx, values, scanOverrides(values, undefined))
  const engine = openEngine(ctx, file, config)
  const opCtx: OperationContext = { store: engine.store, scanner: engine.scanner, notifier: engine.notifier }
  const json = Boolean(values['json'])
  try {
    if (action === 'list') {
      const channels = await invoke(operations, opCtx, 'notifications.list', {}) as NotificationChannel[]
      if (json)
        ctx.out.write(`${JSON.stringify(channels, null, 2)}\n`)
      else if (!channels.length)
        ctx.out.write('No notification channels. Add notifications to unlighthouse.config.ts or call notifications.create.\n')
      for (const channel of json ? [] : channels)
        ctx.out.write(`${channel.id}  ${channel.type}  ${channel.url}  on ${channel.on.join(',')}  ${channel.sites ? channel.sites.join(',') : 'all sites'}  ${channel.source}\n`)
      return 0
    }
    const delivery = await invoke(operations, opCtx, 'notifications.test', { id: target }) as Delivery
    if (json)
      ctx.out.write(`${JSON.stringify(delivery, null, 2)}\n`)
    else if (delivery.status === 'sent')
      ctx.out.write(`Sent a test message to ${target} (HTTP ${delivery.httpStatus})\n`)
    else
      ctx.err.write(`Test message to ${target} failed after ${delivery.attempts} attempt(s): ${delivery.error}\n`)
    return delivery.status === 'sent' ? 0 : 1
  }
  finally {
    await engine.close()
  }
}

const COMMANDS: Record<string, (ctx: Context, args: string[]) => Promise<number>> = {
  scan: commandScan,
  ci: commandCi,
  serve: commandServe,
  mcp: commandMcp,
  compare: commandCompare,
  export: commandExport,
  flow: commandFlow,
  doctor: commandDoctor,
  prune: commandPrune,
  config: commandConfig,
  schedule: commandSchedule,
  notify: commandNotify,
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const ctx: Context = {
    cwd: deps.cwd ?? process.cwd(),
    env: deps.env ?? process.env,
    out: deps.stdout ?? process.stdout,
    err: deps.stderr ?? process.stderr,
    deps,
  }
  const [command, ...rest] = argv
  if (command === WORKER_COMMAND && rest[0]) {
    const { runWorker } = await import('./audit/worker.ts')
    return runWorker(rest[0])
  }
  if (command === FLOW_WORKER_COMMAND && rest[0]) {
    const { runFlowWorker } = await import('./audit/flow-worker.ts')
    return runFlowWorker(rest[0])
  }
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    ctx.out.write(HELP)
    return command ? 0 : 2
  }
  if (command === '--version' || command === '-v') {
    ctx.out.write(`${VERSION}\n`)
    return 0
  }
  const run = COMMANDS[command]
  if (!run) {
    ctx.err.write(`Unknown command: ${command}\n\n${HELP}`)
    return 2
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    ctx.out.write(HELP)
    return 0
  }
  try {
    return await run(ctx, rest)
  }
  catch (error) {
    if (error instanceof UsageError) {
      ctx.err.write(`${error.message}\nRun unlighthouse --help for usage.\n`)
      return 2
    }
    const payload = toErrorPayload(error)
    ctx.err.write(`error ${payload.code}: ${payload.message}\n`)
    return 2
  }
}

if (import.meta.main)
  process.exit(await main(process.argv.slice(2)))
