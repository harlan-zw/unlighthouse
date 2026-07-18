import type { Assertion, AssertionResult } from '@unlighthouse/contracts/types/atoms'
import { evaluateAndStoreAssertions } from '@unlighthouse/core/comparison'

export async function runAssertions(
  db: unknown,
  scanId: string,
  assertionConfigs: Assertion[],
  logger: { error: (...args: unknown[]) => void, success: (...args: unknown[]) => void },
): Promise<{ passed: boolean, results: AssertionResult[] }> {
  const results = await evaluateAndStoreAssertions(db, scanId, assertionConfigs)
  const failures = results.filter(r => !r.passed)

  if (failures.length > 0) {
    logger.error(`${failures.length} assertion(s) failed:`)
    for (const f of failures) {
      const label = ('category' in f.assertion ? f.assertion.category : undefined)
        || ('metric' in f.assertion ? f.assertion.metric : undefined)
        || f.assertion.type
      logger.error(`  ${f.assertion.type} ${label}: expected ${f.assertion.value}, got ${f.actual}`)
      if (f.url)
        logger.error(`    - ${f.url}`)
    }
    return { passed: false, results }
  }

  logger.success(`All ${results.length} assertion(s) passed.`)
  return { passed: true, results }
}
