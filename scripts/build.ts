import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { BunPlugin } from 'bun'
import { staticBundle } from '../src/server/static-bundle.ts'

const ROOT = resolve(import.meta.dir, '..')
const MODULES = join(ROOT, 'node_modules')
const DIST = join(ROOT, 'dist')
const STATIC_BUNDLE = join(ROOT, 'src/server/static-bundle.ts')

const TARGETS = {
  'linux-x64': 'bun-linux-x64',
  'linux-arm64': 'bun-linux-arm64',
  'darwin-arm64': 'bun-darwin-arm64',
  'darwin-x64': 'bun-darwin-x64',
  'windows-x64': 'bun-windows-x64',
} as const satisfies Record<string, Bun.Build.CompileTarget>

type Target = keyof typeof TARGETS

const LIB_ROOTS = ['lighthouse', 'puppeteer-core']
const LIB_IMPORT = /^(?:lighthouse|puppeteer-core)(?:\/.*)?$/

// Lighthouse dependencies used only by its own CLI, by type declarations or by opt-in error reporting.
const LIGHTHOUSE_UNUSED = new Set([
  '@sentry/node',
  'chrome-launcher',
  'configstore',
  'devtools-protocol',
  'enquirer',
  'open',
  'web-features',
  'ws',
  'yargs',
  'yargs-parser',
])

interface Manifest {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function findPackage(name: string, from: string): string | null {
  let dir = from
  while (dir.startsWith(ROOT)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json')))
      return candidate
    const parent = dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
  return null
}

function libraryPackages(): string[] {
  const found = new Set<string>()
  const queue: Array<{ name: string, from: string, optional: boolean }> = LIB_ROOTS.map(name => ({ name, from: ROOT, optional: false }))
  while (queue.length) {
    const { name, from, optional } = queue.shift()!
    const dir = findPackage(name, from)
    if (!dir) {
      if (optional)
        continue
      throw new Error(`${name} (needed by ${relative(ROOT, from) || 'unlighthouse'}) is not installed; run bun install --frozen-lockfile`)
    }
    if (found.has(dir) || name.startsWith('@types/'))
      continue
    found.add(dir)
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest
    const skip = name === 'lighthouse' ? LIGHTHOUSE_UNUSED : new Set<string>()
    for (const dep of Object.keys(manifest.dependencies ?? {}))
      if (!skip.has(dep))
        queue.push({ name: dep, from: dir, optional: false })
    for (const dep of Object.keys(manifest.optionalDependencies ?? {}))
      queue.push({ name: dep, from: dir, optional: true })
    for (const dep of Object.keys(manifest.peerDependencies ?? {}))
      queue.push({ name: dep, from: dir, optional: true })
  }
  return [...found].sort()
}

function copyLibrary(packages: string[], out: string): void {
  for (const dir of packages) {
    cpSync(dir, join(out, 'node_modules', relative(MODULES, dir)), {
      recursive: true,
      filter: (source) => {
        const inside = relative(dir, source)
        return !inside.split(sep).includes('node_modules') && !/\.d\.[cm]?ts$|\.map$/.test(inside)
      },
    })
  }
}

function libraryModule(specifier: string, names: string[]): string {
  const json = specifier.endsWith('.json')
  return `import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
const lib = join(dirname(realpathSync(process.execPath)), 'lib')
let file
try {
  file = Bun.resolveSync(${JSON.stringify(specifier)}, lib)
}
catch (error) {
  throw new Error(${JSON.stringify(`Unlighthouse cannot load ${specifier} from `)} + join(lib, 'node_modules') + '. Keep the lib folder from the release archive next to the unlighthouse binary.', { cause: error })
}
const mod = await import(file${json ? ', { with: { type: \'json\' } }' : ''})
export default mod.default
${names.length ? `export const { ${names.join(', ')} } = mod\n` : ''}`
}

function binaryPlugin(bundle: Awaited<ReturnType<typeof staticBundle>>): BunPlugin {
  return {
    name: 'unlighthouse-binary',
    setup(build) {
      build.onResolve({ filter: LIB_IMPORT }, args => ({ path: args.path, namespace: 'unlighthouse-lib' }))
      build.onLoad({ filter: /.*/, namespace: 'unlighthouse-lib' }, async ({ path }) => {
        const mod = await import(path, path.endsWith('.json') ? { with: { type: 'json' } } : undefined) as Record<string, unknown>
        const names = Object.keys(mod).filter(name => name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name))
        return { loader: 'js', contents: libraryModule(path, names) }
      })
      build.onLoad({ filter: /static-bundle\.ts$/ }, ({ path }) => {
        if (path !== STATIC_BUNDLE)
          return undefined
        return { loader: 'ts', contents: `export async function staticBundle() {\n  return ${JSON.stringify(bundle)}\n}\n` }
      })
    },
  }
}

async function run(command: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(command, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (await proc.exited !== 0)
    throw new Error(`${command.join(' ')} failed with exit code ${proc.exitCode}`)
}

function size(path: string): string {
  return `${(statSync(path).size / 1024 / 1024).toFixed(1)} MB`
}

async function buildTarget(target: Target, plugin: BunPlugin, packages: string[]): Promise<string> {
  const name = `unlighthouse-${target}`
  const stage = join(DIST, name)
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })
  const binary = join(stage, target.startsWith('windows') ? 'unlighthouse.exe' : 'unlighthouse')
  const result = await Bun.build({
    entrypoints: [join(ROOT, 'src/cli.ts')],
    target: 'bun',
    minify: true,
    plugins: [plugin],
    // Without package.json loading a compiled binary cannot resolve packages on disk, so lib/ would not load.
    compile: { target: TARGETS[target], outfile: binary, autoloadPackageJson: true },
  })
  if (!result.success)
    throw new Error(`Compiling ${target} failed:\n${result.logs.map(log => String(log)).join('\n')}`)
  copyLibrary(packages, join(stage, 'lib'))
  cpSync(join(ROOT, 'LICENSE'), join(stage, 'LICENSE'))
  const archive = join(DIST, `${name}.tar.gz`)
  rmSync(archive, { force: true })
  await run(['tar', '-czf', archive, name], DIST)
  console.log(`${name}.tar.gz  ${size(archive)} (binary ${size(binary)})`)
  return archive
}

async function main(args: string[]): Promise<void> {
  const unknown = args.filter(arg => !(arg in TARGETS))
  if (unknown.length)
    throw new Error(`Unknown target ${unknown.join(', ')}; choose from ${Object.keys(TARGETS).join(', ')}`)
  const targets = (args.length ? args : Object.keys(TARGETS)) as Target[]
  const packages = libraryPackages()
  console.log(`lib/node_modules: ${packages.length} packages (${packages.map(dir => relative(MODULES, dir)).join(', ')})`)
  const plugin = binaryPlugin(await staticBundle())
  mkdirSync(DIST, { recursive: true })
  for (const target of targets)
    await buildTarget(target, plugin, packages)
}

if (import.meta.main)
  await main(process.argv.slice(2))
