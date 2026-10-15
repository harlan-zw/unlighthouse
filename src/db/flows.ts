import type { Database, SQLQueryBindings } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FlowFailure, FlowRunResult, Store } from '../contracts.ts'
import { hashUrl } from '../discover/urls.ts'
import { CATEGORIES, FLOW_METRICS } from '../types.ts'
import type { Category, Device, Finding, FlowMetrics, FlowRun, FlowRunStatus, FlowStep, FlowStepMode, Scores, Severity } from '../types.ts'
import { metricColumn, scoreColumn } from './migrations.ts'

type Row = Record<string, unknown>
type Value = Exclude<SQLQueryBindings, Record<string, unknown>>
type Bindings = Record<string, Value>

type FlowQueries = Pick<Store, 'saveFlowResult' | 'saveFlowFailure' | 'listFlowRuns' | 'getFlowRun' | 'getFlowReport'>

function toStep(row: Row): FlowStep {
  const scores = {} as Scores
  for (const category of CATEGORIES)
    scores[category] = row[scoreColumn(category)] as number | null
  const metrics = {} as FlowMetrics
  for (const metric of FLOW_METRICS)
    metrics[metric] = row[metricColumn(metric)] as number | null
  return {
    index: row['step'] as number,
    name: row['name'] as string,
    mode: row['mode'] as FlowStepMode,
    url: row['url'] as string,
    scores,
    metrics,
    warnings: JSON.parse(row['warnings'] as string) as string[],
    findings: row['finding_count'] as number,
  }
}

function toRun(row: Row, steps: FlowStep[]): FlowRun {
  return {
    scanId: row['scan_id'] as string,
    name: row['name'] as string,
    device: row['device'] as Device,
    status: row['status'] as FlowRunStatus,
    startUrl: row['start_url'] as string,
    lighthouseVersion: row['lighthouse_version'] as string | null,
    error: row['error'] as string | null,
    durationMs: row['duration_ms'] as number | null,
    finishedAt: row['finished_at'] as number,
    steps,
  }
}

function toFinding(row: Row): Finding {
  return {
    auditId: row['audit_id'] as string,
    category: row['category'] as Category | null,
    title: row['title'] as string,
    severity: row['severity'] as Severity,
    score: row['score'] as number | null,
    displayValue: row['display_value'] as string | null,
    itemKey: row['item_key'] as string,
    itemLabel: row['item_label'] as string | null,
    savingsMs: row['savings_ms'] as number | null,
    savingsBytes: row['savings_bytes'] as number | null,
  }
}

const STEP_SELECT = `SELECT s.*, (SELECT count(*) FROM flow_findings f
  WHERE f.scan_id = s.scan_id AND f.flow = s.flow AND f.device = s.device AND f.step = s.step) AS finding_count
  FROM flow_steps s`

export function flowQueries(db: Database, scanDir: (scanId: string) => string): FlowQueries {
  const all = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).all(bindings)
  const get = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).get(bindings)
  const run = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).run(bindings)
  const blobPath = (scanId: string, name: string, device: Device) => join(scanDir(scanId), `flow-${hashUrl(name)}-${device}.json.gz`)

  function writeRun(scanId: string, entry: { name: string, device: Device, status: FlowRunStatus, startUrl: string, lighthouseVersion: string | null, error: string | null, durationMs: number | null }): void {
    run(`INSERT INTO flow_runs (scan_id, name, device, status, start_url, lighthouse_version, error, duration_ms, finished_at)
      VALUES ($scanId, $name, $device, $status, $startUrl, $lighthouseVersion, $error, $durationMs, $now)
      ON CONFLICT(scan_id, name, device) DO UPDATE SET status = excluded.status, start_url = excluded.start_url,
        lighthouse_version = excluded.lighthouse_version, error = excluded.error, duration_ms = excluded.duration_ms, finished_at = excluded.finished_at`, {
      scanId,
      name: entry.name,
      device: entry.device,
      status: entry.status,
      startUrl: entry.startUrl,
      lighthouseVersion: entry.lighthouseVersion,
      error: entry.error,
      durationMs: entry.durationMs,
      now: Date.now(),
    })
    run('DELETE FROM flow_steps WHERE scan_id = $scanId AND flow = $name AND device = $device', { scanId, name: entry.name, device: entry.device })
  }

  const saveResult = db.transaction((scanId: string, result: FlowRunResult) => {
    writeRun(scanId, { ...result, status: 'done', error: null })
    const columns = [...CATEGORIES.map(scoreColumn), ...FLOW_METRICS.map(metricColumn)]
    const insertStep = db.query<Row, Bindings>(`INSERT INTO flow_steps (scan_id, flow, device, step, name, mode, url, ${columns.join(', ')}, warnings)
      VALUES ($scanId, $flow, $device, $step, $name, $mode, $url, ${columns.map(column => `$${column}`).join(', ')}, $warnings)`)
    const insertFinding = db.query<Row, Bindings>(`INSERT INTO flow_findings
      (scan_id, flow, device, step, audit_id, category, title, severity, score, display_value, item_key, item_label, savings_ms, savings_bytes)
      VALUES ($scanId, $flow, $device, $step, $auditId, $category, $title, $severity, $score, $displayValue, $itemKey, $itemLabel, $savingsMs, $savingsBytes)`)
    result.steps.forEach((step, index) => {
      const key = { scanId, flow: result.name, device: result.device, step: index }
      const bindings: Bindings = { ...key, name: step.name, mode: step.mode, url: step.url, warnings: JSON.stringify(step.warnings) }
      for (const category of CATEGORIES)
        bindings[scoreColumn(category)] = step.scores[category] ?? null
      for (const metric of FLOW_METRICS)
        bindings[metricColumn(metric)] = step.metrics[metric] ?? null
      insertStep.run(bindings)
      for (const finding of step.findings)
        insertFinding.run({ ...key, ...finding })
    })
    const path = blobPath(scanId, result.name, result.device)
    mkdirSync(scanDir(scanId), { recursive: true })
    const temp = `${path}.${process.pid}.tmp`
    writeFileSync(temp, result.report)
    renameSync(temp, path)
  })

  const saveFailure = db.transaction((scanId: string, failure: FlowFailure) => {
    writeRun(scanId, { ...failure, status: 'failed', lighthouseVersion: null })
  })

  function steps(scanId: string, name: string, device: Device): FlowStep[] {
    return all(`${STEP_SELECT} WHERE s.scan_id = $scanId AND s.flow = $name AND s.device = $device ORDER BY s.step`, { scanId, name, device }).map(toStep)
  }

  return {
    saveFlowResult(scanId, result) {
      saveResult.immediate(scanId, result)
    },

    saveFlowFailure(scanId, failure) {
      saveFailure.immediate(scanId, failure)
    },

    listFlowRuns(scanId) {
      return all('SELECT * FROM flow_runs WHERE scan_id = $scanId ORDER BY name, device', { scanId })
        .map(row => toRun(row, steps(scanId, row['name'] as string, row['device'] as Device)))
    },

    getFlowRun(scanId, name, device) {
      const row = get('SELECT * FROM flow_runs WHERE scan_id = $scanId AND name = $name AND device = $device', { scanId, name, device })
      if (!row)
        return null
      const findings = db.query<Row, Bindings>(`SELECT * FROM flow_findings WHERE scan_id = $scanId AND flow = $name AND device = $device AND step = $step
        ORDER BY severity, coalesce(savings_ms, 0) DESC, coalesce(savings_bytes, 0) DESC, audit_id, item_key`)
      return {
        ...toRun(row, []),
        steps: steps(scanId, name, device).map(step => ({
          ...step,
          findings: findings.all({ scanId, name, device, step: step.index }).map(toFinding),
        })),
      }
    },

    getFlowReport(scanId, name, device) {
      if (!get(`SELECT 1 AS found FROM flow_runs WHERE scan_id = $scanId AND name = $name AND device = $device AND status = 'done'`, { scanId, name, device }))
        return null
      const path = blobPath(scanId, name, device)
      return existsSync(path) ? new Uint8Array(readFileSync(path)) : null
    },
  }
}
