import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PLUGIN_NAME = 'lighthouse-plugin-unlighthouse-test'
export const PLUGIN_AUDIT = 'unlighthouse-test-audit'

export function writePlugin(project: string): void {
  const dir = join(project, 'node_modules', PLUGIN_NAME)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: PLUGIN_NAME, type: 'module', main: 'plugin.js' }))
  writeFileSync(join(dir, 'plugin.js'), `export default {
  audits: [{ path: '${PLUGIN_NAME}/audit.js' }],
  category: { title: 'Unlighthouse test', auditRefs: [{ id: '${PLUGIN_AUDIT}', weight: 1 }] },
}
`)
  writeFileSync(join(dir, 'audit.js'), `export default class UnlighthouseTestAudit {
  static get meta() {
    return { id: '${PLUGIN_AUDIT}', title: 'Has the Unlighthouse marker', failureTitle: 'Lacks the Unlighthouse marker', description: 'Test audit from a plugin.', requiredArtifacts: ['URL'] }
  }
  static audit() {
    return { score: 0 }
  }
}
`)
}
