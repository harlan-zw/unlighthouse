import type { Budgets } from '../config.ts'
import { CATEGORIES, FLOW_METRICS } from '../types.ts'
import type { Category, Device, FlowMetric, FlowRun, FlowRunStatus, FlowStepMode } from '../types.ts'
import type { BudgetResult } from './budgets.ts'
import { round, roundScore } from './stats.ts'

const BRIEF_METRICS: FlowMetric[] = ['inp', 'tbt', 'cls', 'lcp']

export interface FlowStepBrief {
  name: string
  mode: FlowStepMode
  performance: number | null
  metrics: Partial<Record<FlowMetric, number>>
  findings: number
}

export interface FlowBrief {
  name: string
  device: Device
  status: FlowRunStatus
  error?: string
  steps: FlowStepBrief[]
}

function roundFlowMetric(metric: FlowMetric, value: number): number {
  return metric === 'cls' ? round(value, 3) : Math.round(value)
}

export function briefFlows(runs: FlowRun[]): FlowBrief[] {
  return runs.map((run) => {
    const brief: FlowBrief = {
      name: run.name,
      device: run.device,
      status: run.status,
      steps: run.steps.map((step) => {
        const metrics: Partial<Record<FlowMetric, number>> = {}
        for (const metric of BRIEF_METRICS) {
          const value = step.metrics[metric]
          if (value !== null)
            metrics[metric] = roundFlowMetric(metric, value)
        }
        const performance = step.scores.performance
        return { name: step.name, mode: step.mode, performance: performance === null ? null : roundScore(performance), metrics, findings: step.findings }
      }),
    }
    if (run.error)
      brief.error = run.error
    return brief
  })
}

function skipped(rule: string, scope: string, limit: number, detail: string): BudgetResult {
  return { rule, scope, actual: null, limit, passed: true, skipped: true, detail }
}

export function flowBudgetRules(runs: FlowRun[], budgets: Budgets): BudgetResult[] {
  const results: BudgetResult[] = []
  for (const [name, budget] of Object.entries(budgets.flows)) {
    const rules: Array<{ rule: string, limit: number, value: (step: FlowRun['steps'][number]) => number | null, passes: (actual: number, limit: number) => boolean, display: (actual: number) => number }> = [
      ...CATEGORIES.filter(category => budget.steps.scores[category] !== undefined).map((category: Category) => ({
        rule: `flow:score:${category}`,
        limit: budget.steps.scores[category]!,
        value: (step: FlowRun['steps'][number]) => step.scores[category],
        passes: (actual: number, limit: number) => actual >= limit,
        display: roundScore,
      })),
      ...FLOW_METRICS.filter(metric => budget.steps.metrics[metric] !== undefined).map((metric: FlowMetric) => ({
        rule: `flow:metric:${metric}`,
        limit: budget.steps.metrics[metric]!,
        value: (step: FlowRun['steps'][number]) => step.metrics[metric],
        passes: (actual: number, limit: number) => actual <= limit,
        display: (actual: number) => roundFlowMetric(metric, actual),
      })),
    ]
    if (!rules.length)
      continue
    const flowRuns = runs.filter(run => run.name === name)
    if (!flowRuns.length) {
      for (const { rule, limit } of rules)
        results.push(skipped(rule, name, limit, 'flow not run in this scan'))
      continue
    }
    for (const run of flowRuns) {
      const scope = `${name} · ${run.device}`
      if (run.status === 'failed') {
        results.push({ rule: 'flow:run', scope, actual: null, limit: 0, passed: false, detail: run.error ?? 'the flow failed' })
        continue
      }
      for (const { rule, limit, value, passes, display } of rules) {
        const measured = run.steps.filter(step => value(step) !== null)
        if (!measured.length) {
          results.push(skipped(rule, scope, limit, 'not measured on any step'))
          continue
        }
        for (const step of measured) {
          const actual = value(step)!
          results.push({ rule, scope: `${scope} · ${step.name}`, actual: display(actual), limit, passed: passes(actual, limit) })
        }
      }
    }
  }
  return results
}
