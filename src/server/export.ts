import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { CsvOptions } from '../analysis/csv.ts'
import { issuesCsv, pagesCsv } from '../analysis/csv.ts'
import type { Store } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import { analyzeScan, getScan, meanScores, publicScan } from '../ops/analysis.ts'
import { isFinished } from '../scan/runner.ts'
import type { Finding } from '../types.ts'
import type { Snapshot } from '../ui/static.ts'
import { pageKey, SNAPSHOT_VERSION } from '../ui/static.ts'
import { renderFlowReport, renderReport } from './app.ts'
import { staticBundle } from './static-bundle.ts'

export const EXPORT_MARKER = '.unlighthouse-export.json'
const EXPORT_ENTRIES = new Set([EXPORT_MARKER, 'index.html', 'data.js', 'assets', 'reports', 'thumbs', 'flows.json', 'flow-reports'])

export interface ExportOptions {
  store: Store
  scanId: string
  out: string
  reports?: boolean
  version: string
}

export interface ExportResult {
  dir: string
  scanId: string
  pages: number
  reports: number
  thumbnails: number
  flows: number
}

export function buildSnapshot(store: Store, scanId: string, version: string): Snapshot {
  const scan = getScan(store, scanId)
  if (!isFinished(scan))
    throw new UnlighthouseError('SCAN_ACTIVE', `Scan ${scan.id} is ${scan.status}; export it once it has finished`)
  const analysis = analyzeScan(store, scan.id)
  const pages = analysis.side.pages
  const findings: Record<string, Finding[]> = {}
  for (const page of pages) {
    const list = store.findings(scan.id, page.url, page.device)
    if (list.length)
      findings[pageKey(page.url, page.device)] = list
  }
  const site = store.listSites().find(candidate => candidate.origin === scan.origin)
  const scans = [publicScan(scan), ...(analysis.baseline ? [publicScan(analysis.baseline)] : [])]
  return {
    version: SNAPSHOT_VERSION,
    unlighthouse: version,
    generatedAt: Date.now(),
    scanId: scan.id,
    site: {
      id: scan.siteId,
      origin: scan.origin,
      createdAt: site?.createdAt ?? scan.createdAt,
      scans: scans.length,
      lastScan: publicScan(scan),
      lastScores: meanScores(pages, scan.devices),
    },
    scans,
    summary: analysis.summary,
    pages,
    findings,
    templates: store.templates(scan.id),
    brokenLinks: store.brokenLinks(scan.id),
    comparison: analysis.comparison ?? null,
    reports: {},
  }
}

function checkTarget(dir: string): 'missing' | 'empty' | 'previous' {
  if (!existsSync(dir))
    return 'missing'
  const stat = lstatSync(dir)
  if (stat.isSymbolicLink())
    throw new UnlighthouseError('INVALID_INPUT', `${dir} is a symbolic link; choose a real directory for the export`)
  if (!stat.isDirectory())
    throw new UnlighthouseError('INVALID_INPUT', `${dir} exists and is not a directory`)
  const entries = readdirSync(dir)
  if (entries.length === 0)
    return 'empty'
  if (!entries.includes(EXPORT_MARKER))
    throw new UnlighthouseError('INVALID_INPUT', `${dir} is not empty and is not a Unlighthouse export (no ${EXPORT_MARKER}); refusing to overwrite it. Pass another --out directory.`)
  const foreign = entries.filter(entry => !EXPORT_ENTRIES.has(entry))
  if (foreign.length)
    throw new UnlighthouseError('INVALID_INPUT', `${dir} is a previous Unlighthouse export but also holds ${foreign.join(', ')}; refusing to delete files Unlighthouse did not write. Move them away or pass another --out directory.`)
  return 'previous'
}

function indexHtml(source: string, title: string): string {
  const stylesheet = '<link rel="stylesheet" href="./styles.css" />'
  const script = '<script type="module" src="./main.tsx"></script>'
  if (!source.includes(stylesheet) || !source.includes(script))
    throw new Error('src/ui/index.html no longer has the expected stylesheet and script tags')
  return source
    .replace('<title>Unlighthouse</title>', `<title>${Bun.escapeHTML(title)}</title>`)
    .replace(stylesheet, '<meta name="referrer" content="no-referrer" />\n    <link rel="stylesheet" href="assets/unlighthouse.css" />')
    .replace(script, '<script src="data.js"></script>\n    <script src="assets/unlighthouse.js"></script>')
}

function exportName(url: string, device: string): string {
  return `${device}-${new Bun.CryptoHasher('sha256').update(url).digest('hex').slice(0, 16)}`
}

function reportFile(url: string, device: string): string {
  return `reports/${exportName(url, device)}.html`
}

function thumbnailFile(url: string, device: string): string {
  return `thumbs/${exportName(url, device)}.webp`
}

function writeFlows(store: Store, scanId: string, staging: string, reports: boolean): number {
  const runs = store.listFlowRuns(scanId)
  if (!runs.length)
    return 0
  if (reports)
    mkdirSync(join(staging, 'flow-reports'))
  const flows = runs.map((run) => {
    const detail = store.getFlowRun(scanId, run.name, run.device) ?? run
    const report = reports ? store.getFlowReport(scanId, run.name, run.device) : null
    if (!report)
      return { ...detail, report: null }
    const file = `flow-reports/${run.device}-${new Bun.CryptoHasher('sha256').update(run.name).digest('hex').slice(0, 16)}.html`
    writeFileSync(join(staging, file), renderFlowReport(report))
    return { ...detail, report: file }
  })
  writeFileSync(join(staging, 'flows.json'), `${JSON.stringify(flows, null, 2)}\n`)
  return runs.length
}

export async function exportScan(options: ExportOptions): Promise<ExportResult> {
  const dir = resolve(options.out)
  const state = checkTarget(dir)
  const snapshot = buildSnapshot(options.store, options.scanId, options.version)
  const { html, js, css } = await staticBundle()
  const parent = dirname(dir)
  mkdirSync(parent, { recursive: true })
  const staging = join(parent, `.${basename(dir)}.unlighthouse-${crypto.randomUUID().slice(0, 8)}`)
  mkdirSync(join(staging, 'assets'), { recursive: true })
  try {
    let reports = 0
    if (options.reports !== false) {
      mkdirSync(join(staging, 'reports'))
      for (const page of snapshot.pages) {
        if (page.status !== 'done')
          continue
        const report = options.store.getReport(snapshot.scanId, page.url, page.device)
        if (!report)
          continue
        const file = reportFile(page.url, page.device)
        writeFileSync(join(staging, file), renderReport(report))
        snapshot.reports[pageKey(page.url, page.device)] = file
        reports++
      }
    }
    const thumbnails: Record<string, string> = {}
    mkdirSync(join(staging, 'thumbs'))
    for (const page of snapshot.pages) {
      if (page.status !== 'done')
        continue
      const thumbnail = options.store.getThumbnail(snapshot.scanId, page.url, page.device)
      if (!thumbnail)
        continue
      const file = thumbnailFile(page.url, page.device)
      writeFileSync(join(staging, file), thumbnail)
      thumbnails[pageKey(page.url, page.device)] = file
    }
    const flows = writeFlows(options.store, snapshot.scanId, staging, options.reports !== false)
    writeFileSync(join(staging, 'assets', 'unlighthouse.js'), js)
    writeFileSync(join(staging, 'assets', 'unlighthouse.css'), css)
    writeFileSync(join(staging, 'data.js'), `window.UNLIGHTHOUSE_SNAPSHOT = ${JSON.stringify({ ...snapshot, thumbnails })};\n`)
    writeFileSync(join(staging, 'index.html'), indexHtml(html, `Unlighthouse · ${new URL(snapshot.site.origin).host} · ${snapshot.scanId}`))
    writeFileSync(join(staging, EXPORT_MARKER), `${JSON.stringify({ unlighthouse: options.version, scanId: snapshot.scanId, generatedAt: snapshot.generatedAt }, null, 2)}\n`)
    if (checkTarget(dir) !== state)
      throw new UnlighthouseError('INVALID_INPUT', `${dir} changed while the export was being written; nothing was replaced`)
    if (state === 'previous')
      rmSync(dir, { recursive: true, force: true })
    else if (state === 'empty')
      rmdirSync(dir)
    renameSync(staging, dir)
    return { dir, scanId: snapshot.scanId, pages: snapshot.pages.length, reports, thumbnails: Object.keys(thumbnails).length, flows }
  }
  catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

export const CSV_FILES = ['pages.csv', 'issues.csv'] as const
export type CsvFile = typeof CSV_FILES[number]

export function scanCsv(store: Store, scanId: string, file: CsvFile, options: CsvOptions = {}): string {
  const scan = getScan(store, scanId)
  if (file === 'pages.csv')
    return pagesCsv(store.allPages(scan.id), options)
  return issuesCsv(store.listIssues({ scanId: scan.id, limit: 1_000_000, offset: 0 }).items, options)
}

export interface CsvExportResult {
  dir: string
  scanId: string
  files: string[]
}

export function exportCsv(options: { store: Store, scanId: string, out: string, bom?: boolean }): CsvExportResult {
  const dir = resolve(options.out)
  if (existsSync(dir) && !lstatSync(dir).isDirectory())
    throw new UnlighthouseError('INVALID_INPUT', `${dir} exists and is not a directory`)
  const contents = CSV_FILES.map(file => [file, scanCsv(options.store, options.scanId, file, { bom: options.bom ?? false })] as const)
  mkdirSync(dir, { recursive: true })
  const files: string[] = []
  for (const [file, content] of contents) {
    const target = join(dir, file)
    const temp = `${target}.${process.pid}.tmp`
    writeFileSync(temp, content)
    renameSync(temp, target)
    files.push(target)
  }
  return { dir, scanId: options.scanId, files }
}
