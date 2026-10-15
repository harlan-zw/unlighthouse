import type { BudgetReport, BudgetResult } from './budgets.ts'

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function testcase(result: BudgetResult): string {
  const open = `    <testcase classname="unlighthouse.budgets.${escape(result.scope)}" name="${escape(`${result.rule} [${result.scope}]`)}" time="0"`
  if (result.skipped)
    return `${open}>\n      <skipped message="${escape(result.detail ?? 'skipped')}"/>\n    </testcase>`
  if (result.passed)
    return `${open}/>`
  const message = `${result.rule} on ${result.scope}: actual ${result.actual ?? 'n/a'}, limit ${result.limit}`
  const body = result.detail ? escape(result.detail) : ''
  return `${open}>\n      <failure message="${escape(message)}" type="budget">${body}</failure>\n    </testcase>`
}

export function toJUnit(report: BudgetReport): string {
  const tests = report.results.length
  const failures = report.results.filter(result => !result.passed).length
  const skipped = report.results.filter(result => result.skipped).length
  const counts = `tests="${tests}" failures="${failures}" errors="0" skipped="${skipped}"`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="unlighthouse" ${counts}>`,
    `  <testsuite name="unlighthouse budgets" ${counts}>`,
    ...report.results.map(testcase),
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n')
}
