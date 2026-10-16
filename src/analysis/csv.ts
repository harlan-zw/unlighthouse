import type { Issue, Page } from '../types.ts'
import { CATEGORIES, METRICS } from '../types.ts'

export interface CsvOptions {
  bom?: boolean
}

type Cell = string | number | null

const BOM = '﻿'
const FORMULA_START = /^[=+\-@\t\r]/

export const PAGE_COLUMNS = [
  'url',
  'template',
  'device',
  'status',
  ...CATEGORIES.map(category => `score_${category.replaceAll('-', '_')}`),
  ...METRICS.map(metric => `metric_${metric}`),
  'error',
]

export const ISSUE_COLUMNS = [
  'audit_id',
  'title',
  'category',
  'severity',
  'pages',
  'items',
  'top_item',
  'devices',
  'templates',
  'savings_ms',
  'savings_bytes',
  'impact',
]

function text(value: string | null): string {
  if (value === null)
    return ''
  return FORMULA_START.test(value) ? `'${value}` : value
}

function field(value: Cell): string {
  const raw = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : text(value)
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw
}

function toCsv(header: string[], rows: Cell[][], options: CsvOptions): string {
  const lines = [header, ...rows].map(row => row.map(field).join(','))
  return `${options.bom ? BOM : ''}${lines.join('\r\n')}\r\n`
}

export function pagesCsv(pages: Page[], options: CsvOptions = {}): string {
  const rows = pages.map((page): Cell[] => [
    page.url,
    page.template,
    page.device,
    page.status,
    ...CATEGORIES.map(category => page.scores[category]),
    ...METRICS.map(metric => page.metrics[metric]),
    page.error,
  ])
  return toCsv(PAGE_COLUMNS, rows, options)
}

export function issuesCsv(issues: Issue[], options: CsvOptions = {}): string {
  const rows = issues.map((issue): Cell[] => [
    issue.auditId,
    issue.title,
    issue.category,
    issue.severity,
    issue.pages,
    issue.items,
    issue.topItems[0]?.key ?? null,
    issue.devices.join(' '),
    issue.templates.join(' '),
    issue.savingsMs,
    issue.savingsBytes,
    Math.round(issue.impact * 100) / 100,
  ])
  return toCsv(ISSUE_COLUMNS, rows, options)
}
