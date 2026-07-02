// Scenario 8 (D-039): the shared `@unlighthouse/core/seeds` barrel is the seed
// surface hosts and Worker bundles pull in. The Node-only `route-definitions`
// adapter (which reads `node:fs`) lives behind its OWN subpath export and must
// NOT be re-exported from the barrel — otherwise `node:fs` contaminates every
// bundle that imports seeds. This fixture proves the quarantine holds.
import * as seeds from '@unlighthouse/core/seeds'

export default seeds
