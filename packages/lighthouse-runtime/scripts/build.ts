import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { buildAuditArchive } from './archive.ts'

const require = createRequire(import.meta.url)
const roots = ['lighthouse', 'puppeteer-core', '@puppeteer/browsers'].map(name => dirname(require.resolve(`${name}/package.json`)))
const destination = join(import.meta.dirname, '../dist/runtime.zip')
console.log(await buildAuditArchive(roots, destination))
const { version } = JSON.parse(await readFile(join(import.meta.dirname, '../package.json'), 'utf8'))
const sha256 = createHash('sha256').update(await readFile(destination)).digest('hex')
await writeFile(join(import.meta.dirname, '../dist/manifest.json'), `${JSON.stringify({ version, sha256 })}\n`)
