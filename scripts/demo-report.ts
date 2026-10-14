import { appendFile, cp, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

export type DemoReport
  = | { _tag: 'Ok', directory: string }
    | { _tag: 'Err', reason: 'missing-report' | 'multiple-reports' }

/** Netlify must serve the generated dashboard, not the scan storage root. */
export async function findDemoReport(outputRoot: string): Promise<DemoReport> {
  const files = new Set(await readdir(outputRoot, { recursive: true }))
  const directories = [...files]
    .filter(file => file.endsWith(join('assets', 'payload.js')))
    .map(file => dirname(dirname(file)))
    .filter(directory => files.has(join(directory, 'index.html')))

  if (directories.length === 0)
    return { _tag: 'Err', reason: 'missing-report' }
  if (directories.length !== 1)
    return { _tag: 'Err', reason: 'multiple-reports' }
  return { _tag: 'Ok', directory: join(outputRoot, directories[0]!) }
}

if (import.meta.main) {
  const report = await findDemoReport(resolve('.unlighthouse'))
  if (report._tag === 'Err')
    throw new Error(`Cannot publish the demo: ${report.reason}.`)
  if (!process.env.GITHUB_OUTPUT)
    throw new Error('GITHUB_OUTPUT is required to publish the demo.')

  const directory = resolve('dist-demo')
  // The offline snapshot contains the report data. Local storage stays local.
  await cp(report.directory, directory, {
    recursive: true,
    filter: path => path !== join(report.directory, 'blobs')
      && !basename(path).startsWith('db.sqlite')
      && basename(path) !== '.unlighthouse-output',
  })
  // Preserve real asset responses while serving client-side report routes.
  await writeFile(join(directory, '_redirects'), '/* /index.html 200\n')
  await appendFile(process.env.GITHUB_OUTPUT, `publish-dir=${directory}\n`)
  console.log(`Publish the static dashboard at ${directory}`)
}
