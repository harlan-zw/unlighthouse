// Prepares this package's directory for an OCI image build by vendoring workspace
// dependencies into ./vendor and emitting a stripped-down package.runtime.json
// that doesn't reference workspace:* protocol.
//
// Run through `pnpm build:image` (or `pnpm prepare:image` after a normal build)
// so an image builder sees a self-contained context.
//
// Workspace deps to vendor:
//   - @unlighthouse/contracts
//   - @unlighthouse/core
//
// We `pnpm pack` each one and copy the resulting .tgz into ./vendor, then
// rewrite package.runtime.json to depend on those tarballs by file path.

import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const PKG_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const VENDOR_DIR = path.join(PKG_DIR, 'vendor')
const MONOREPO_ROOT = path.resolve(PKG_DIR, '../..')

// Load pnpm workspace catalog so `catalog:dependencies` placeholders in the
// package.json can be resolved to real semver ranges. The image's npm
// install doesn't know about pnpm catalogs.
function loadCatalogs() {
  const yaml = readFileSync(path.join(MONOREPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')
  const parsed = parseYaml(yaml)
  return {
    default: parsed.catalog ?? {},
    ...(parsed.catalogs ?? {}),
  }
}

function resolveCatalog(version, name, catalogs) {
  if (typeof version !== 'string' || !version.startsWith('catalog:'))
    return version
  const cat = version.slice('catalog:'.length) || 'default'
  const entry = catalogs[cat]?.[name]
  if (!entry)
    throw new Error(`[prepare-image] cannot resolve ${name} in catalog ${cat}`)
  return entry
}

const WORKSPACE_DEPS = [
  '@unlighthouse/contracts',
  '@unlighthouse/core',
]

function pkgDirOf(name) {
  // Workspace packages live at packages/{shortname} — strip the @unlighthouse/ scope.
  const short = name.replace('@unlighthouse/', '')
  return path.join(MONOREPO_ROOT, 'packages', short)
}

function packAndCopy(name) {
  const src = pkgDirOf(name)
  // Trigger a build on the workspace dep so its dist is fresh.
  // `--silent` keeps the parent build log quiet.
  execSync('pnpm build', { cwd: src, stdio: 'inherit' })
  // Pack into a temp dir, then move the tgz into ./vendor.
  const tmp = path.join(VENDOR_DIR, `.pack-${name.replace(/[/@]/g, '_')}`)
  mkdirSync(tmp, { recursive: true })
  const out = execSync(`pnpm pack --pack-destination ${tmp}`, {
    cwd: src,
    encoding: 'utf8',
  }).trim()
  // pnpm pack prints the absolute tgz path on its last line.
  const tgzPath = out.split('\n').filter(Boolean).pop()
  const tgzName = path.basename(tgzPath)
  const dest = path.join(VENDOR_DIR, tgzName)
  copyFileSync(tgzPath, dest)
  rmSync(tmp, { recursive: true, force: true })
  return tgzName
}

function main() {
  rmSync(VENDOR_DIR, { recursive: true, force: true })
  mkdirSync(VENDOR_DIR, { recursive: true })

  const vendored = {}
  for (const dep of WORKSPACE_DEPS) {
    const tgz = packAndCopy(dep)
    // npm install path-based dep: file:vendor/{tgz}
    vendored[dep] = `file:vendor/${tgz}`

    console.log(`[prepare-image] vendored ${dep} → vendor/${tgz}`)
  }

  // Read this package's package.json and emit a Docker-friendly variant.
  const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'))
  const catalogs = loadCatalogs()
  const externalDeps = Object.fromEntries(
    Object.entries(pkg.dependencies ?? {})
      .filter(([k]) => !WORKSPACE_DEPS.includes(k))
      .map(([k, v]) => [k, resolveCatalog(v, k, catalogs)]),
  )
  const runtimePkg = {
    name: pkg.name,
    version: pkg.version,
    private: pkg.private,
    type: pkg.type,
    main: 'dist/entry.mjs',
    dependencies: {
      ...externalDeps,
      ...vendored,
    },
  }
  writeFileSync(
    path.join(PKG_DIR, 'package.runtime.json'),
    `${JSON.stringify(runtimePkg, null, 2)}\n`,
  )

  console.log(`[prepare-image] wrote package.runtime.json with ${WORKSPACE_DEPS.length} vendored deps`)
}

main()
