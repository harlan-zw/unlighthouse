// Worker-side Container transport must not pull the Node Lighthouse runtime.
import { createContainerLighthouseAuditor } from '@unlighthouse/cloudflare/auditors/container'

export default createContainerLighthouseAuditor
