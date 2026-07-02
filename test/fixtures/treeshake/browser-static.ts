// Scenario 7 (D-032): Browser static bundle — the offline dashboard's data
// layer. The live path imports the typed client from contracts; the static
// path imports core's read slice (api/static-client), which reuses the real
// handlers + memory storage. Neither may drag node:* or server/db deps into a
// browser (ssr:false) bundle.
import * as client from '@unlighthouse/contracts/client'
import * as staticClient from '@unlighthouse/core/api/static-client'

export default { client, staticClient }
