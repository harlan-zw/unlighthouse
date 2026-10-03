import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { buildAuditArchive } from './archive.ts'

const require = createRequire(import.meta.url)
const roots = ['lighthouse', 'puppeteer-core', '@puppeteer/browsers'].map(name => dirname(require.resolve(`${name}/package.json`)))
console.log(await buildAuditArchive(roots, join(import.meta.dirname, '../dist/runtime.zip')))
