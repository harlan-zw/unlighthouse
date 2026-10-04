import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { zipSync } from 'fflate'

interface Package {
  directory: string
  name: string
  dependencies: Package[]
}

async function locate(name: string, from: string): Promise<string> {
  let directory = from
  while (true) {
    const candidate = join(directory, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json')))
      return realpath(candidate)
    const parent = dirname(directory)
    if (parent === directory)
      throw new Error(`Missing runtime dependency: ${name}`)
    directory = parent
  }
}

/** Preserve upstream module resolution while removing assets unused by library audits. */
export async function buildAuditArchive(roots: string[], destination: string): Promise<{ bytes: number, archiveBytes: number, packages: number }> {
  const graph = new Map<string, Package>()
  const hoisted = new Map<string, Package>()
  async function discover(directory: string): Promise<Package> {
    directory = await realpath(directory)
    const existing = graph.get(directory)
    if (existing)
      return existing
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    const pkg: Package = { directory, name: manifest.name, dependencies: [] }
    graph.set(directory, pkg)
    hoisted.set(pkg.name, hoisted.get(pkg.name) ?? pkg)
    const dependencies: Record<string, string> = { ...manifest.dependencies }
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (!manifest.peerDependenciesMeta?.[name]?.optional)
        dependencies[name] = manifest.peerDependencies[name]
    }
    for (const name of Object.keys(dependencies).sort()) {
      // Lighthouse's CLI owns telemetry. Library audits never import this graph.
      if (pkg.name === 'lighthouse' && name === '@sentry/node')
        continue
      pkg.dependencies.push(await discover(await locate(name, directory)))
    }
    return pkg
  }
  // Reserve direct dependencies before traversing their transitive graphs.
  for (const directory of roots) {
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    hoisted.set(manifest.name, { directory: await realpath(directory), name: manifest.name, dependencies: [] })
  }
  for (const directory of roots)
    await discover(directory)
  for (const [name, pkg] of hoisted)
    hoisted.set(name, graph.get(pkg.directory)!)

  const files: Record<string, Uint8Array> = {}
  const copied = new Set<string>()
  function excluded(name: string, path: string): boolean {
    if (/\.(?:map|d\.ts|d\.mts|d\.cts)$/.test(path))
      return true
    const prefixes: Record<string, string[]> = {
      'puppeteer-core': ['src/', 'lib/es5-iife/'],
      'zod': ['src/'],
      '@paulirish/trace_engine': ['test/', 'locales/'],
      'third-party-web': ['.yarn/', 'dist/domain-map.csv'],
      'devtools-protocol': ['json/', 'pdl/'],
      'lighthouse': ['shared/localization/locales/'],
    }
    return (prefixes[name] ?? []).some(prefix => path.startsWith(prefix))
  }
  async function copy(pkg: Package, target: string, inherited: Map<string, Package>): Promise<void> {
    if (copied.has(target))
      return
    copied.add(target)
    async function visit(relative: string): Promise<void> {
      for (const entry of await readdir(join(pkg.directory, relative), { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git')
          continue
        const path = relative ? `${relative}/${entry.name}` : entry.name
        if (excluded(pkg.name, path))
          continue
        if (entry.isDirectory()) {
          await visit(path)
        }
        else if (entry.isFile()) {
          files[`${target}/${path}`] = await readFile(join(pkg.directory, path))
        }
        else {
          throw new Error(`Unsupported runtime asset: ${pkg.name}/${path}`)
        }
      }
    }
    await visit('')
    if (pkg.name === 'lighthouse') {
      // Lighthouse supports English through IcuMessage.formattedDefault without locale data.
      files[`${target}/shared/localization/locales.js`] = Buffer.from('export const locales = {}\n')
      // format.js discovers canonical locales from this directory at import time.
      files[`${target}/shared/localization/locales/en-US.json`] = Buffer.from('{}\n')
      files[`${target}/node_modules/@sentry/node/package.json`] = Buffer.from(JSON.stringify({ name: '@sentry/node', version: '0.0.0', private: true, exports: {} }))
    }
    const scope = new Map(inherited)
    for (const dependency of pkg.dependencies)
      scope.set(dependency.name, dependency)
    for (const dependency of pkg.dependencies) {
      if (inherited.get(dependency.name)?.directory !== dependency.directory)
        await copy(dependency, `${target}/node_modules/${dependency.name}`, scope)
    }
  }
  for (const [name, pkg] of hoisted)
    await copy(pkg, `node_modules/${name}`, hoisted)
  const bytes = Object.values(files).reduce((total, data) => total + data.length, 0)
  const archive = zipSync(files, { level: 6, mtime: new Date('2000-01-01T00:00:00Z') })
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, archive)
  return { bytes, archiveBytes: archive.length, packages: graph.size }
}
