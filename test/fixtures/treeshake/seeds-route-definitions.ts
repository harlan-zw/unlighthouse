// Scenario 8 control (D-039): the route-definitions adapter is genuinely
// Node-only — importing its subpath directly MUST pull in `node:fs`. This
// asserts the quarantine in `seeds-barrel.ts` is load-bearing, not vacuous.
import * as routeDefs from '@unlighthouse/core/seeds/route-definitions'

export default routeDefs
