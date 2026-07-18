// assert.evaluate handler — operates on Storage port routes.

import type { Handler } from './types'
import { AssertEvaluate } from '@unlighthouse/contracts/commands'
import { evaluateAssertions } from '../../comparison/policy'
import { loadScanRoutes } from './scan-routes'

// INTERNAL: not used by the UI; CI bypasses this handler but kept for direct API users.
export const assertEvaluate: Handler<typeof AssertEvaluate> = {
  command: AssertEvaluate,
  async run(input, ctx) {
    const routes = await loadScanRoutes(ctx.storage, input.scanId)
    const baseRoutes = input.baselineScanId ? await loadScanRoutes(ctx.storage, input.baselineScanId) : []
    const results = evaluateAssertions(routes, input.assertions, baseRoutes)
    if (ctx.core.hooks) {
      for (const result of results) {
        await ctx.core.hooks.callHook(result.passed ? 'assert:passed' : 'assert:failed', { scanId: input.scanId, result })
      }
    }
    const passed = results.every(r => r.passed)
    return AssertEvaluate.output.parse({ scanId: input.scanId, passed, results })
  },
}
