import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

/** Preserve license notices for dependencies included in published runtime bundles. */
export function writeBundledLicenses(chunks: Array<{ type: string, modules?: Record<string, unknown> }>, outputDirectory: string): void {
  const packages = new Map<string, { root: string, name: string, version: string }>()
  for (const chunk of chunks) {
    for (const id of Object.keys(chunk.modules ?? {})) {
      if (!isAbsolute(id) || !id.includes('/node_modules/'))
        continue
      let directory = dirname(id)
      while (true) {
        const path = join(directory, 'package.json')
        if (existsSync(path)) {
          const pkg = JSON.parse(readFileSync(path, 'utf8'))
          if (pkg.name && pkg.version) {
            if (!pkg.name.startsWith('@unlighthouse/'))
              packages.set(`${pkg.name}@${pkg.version}`, { root: directory, name: pkg.name, version: pkg.version })
            break
          }
        }
        const parent = dirname(directory)
        if (parent === directory)
          break
        directory = parent
      }
    }
  }
  const notices = [...packages.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, pkg]) => {
    const files = readdirSync(pkg.root).filter(file => /^(license|licence|copying|notice)(\.|$)/i.test(file))
    // Drizzle's npm artifact omits the upstream license file. Preserve the pinned release's copy.
    if (!files.length && name === 'drizzle-orm@0.45.3')
      return `${name}\n${readFileSync(join(import.meta.dirname, 'licenses/drizzle-orm-0.45.3.LICENSE'), 'utf8')}\n`
    if (!files.length)
      throw new Error(`Bundled dependency has no license notice: ${name}`)
    return `${name}\n${files.map(file => readFileSync(join(pkg.root, file), 'utf8')).join('\n')}\n`
  })
  writeFileSync(join(outputDirectory, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n'))
}
