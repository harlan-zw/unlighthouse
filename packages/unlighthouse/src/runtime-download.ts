import type { Logger } from '@unlighthouse/contracts'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { npmProjectConfig } from './audit-download-config'

declare const __UNLIGHTHOUSE_RUNTIME_PACKAGES__: Record<string, string>

// Replaced from installed package versions at build time. Source tests use these pins.
const versions = typeof __UNLIGHTHOUSE_RUNTIME_PACKAGES__ === 'undefined'
  ? { 'lighthouse': '13.5.0', 'puppeteer-core': '25.12.0', '@puppeteer/browsers': '3.2.3', '@libsql/client': '0.18.0', '@modelcontextprotocol/sdk': '1.31.0', '@unlighthouse/ui': '1.0.0-beta.0', '@unlighthouse/lighthouse-runtime': '1.0.0-beta.1', 'unstorage': '1.17.5', 'aws4fetch': '1.0.20', 'jiti': '2.7.0', '@lhci/utils': '0.15.1' }
  : __UNLIGHTHOUSE_RUNTIME_PACKAGES__

export interface RuntimeDownloadOptions {
  cacheDir?: string
  env?: NodeJS.ProcessEnv
  logger?: Logger
  signal?: AbortSignal
  /** Installer seam for hosts and tests. Installs only into the staging directory. */
  install?: (directory: string, packages: string[], signal?: AbortSignal) => Promise<void>
  /** Verify cached and staged packages before reuse or publication. */
  validate?: (resolve: (specifier: string) => string) => Promise<{ _tag: 'Valid' } | { _tag: 'Invalid', reason: string }>
}

/** Executable caches must not be replaceable by another local account. */
export async function prepareRuntimeCache(cache: string): Promise<void> {
  await mkdir(cache, { recursive: true, mode: 0o700 })
  if (!process.getuid)
    return // Windows access is governed by the user's directory ACLs.
  const root = await realpath(cache)
  let directory = root
  while (true) {
    const info = await stat(directory)
    const trustedOwner = info.uid === process.getuid() || info.uid === 0
    const writable = (info.mode & 0o022) !== 0
    const stickyParent = directory !== root && (info.mode & 0o1000) !== 0
    if (!trustedOwner || (writable && !stickyParent))
      throw new Error('Runtime cache is not protected. Set UNLIGHTHOUSE_RUNTIME_CACHE to a private directory.')
    const parent = dirname(directory)
    if (parent === directory)
      break
    directory = parent
  }
}

export function runtimeCacheDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return env.UNLIGHTHOUSE_RUNTIME_CACHE ?? join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'unlighthouse', 'runtime')
}

export function npmCommand(env: NodeJS.ProcessEnv): { command: string, prefix: string[] } {
  if (process.platform !== 'win32')
    return { command: 'npm', prefix: [] }
  // Execute npm's script through Node. Avoid cmd.exe interpreting cache paths.
  for (const directory of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    const script = join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (existsSync(script))
      return { command: process.execPath, prefix: [script] }
  }
  throw new Error('npm was not found. Install npm to download audit dependencies.')
}

async function installPackages(directory: string, packages: string[], env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<void> {
  const { command, prefix } = npmCommand(env)
  const installSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000)
  const projectConfig = npmProjectConfig(env)
  const cwd = projectConfig ? dirname(projectConfig) : process.cwd()
  const run = (args: string[]) => new Promise<string>((resolve, reject) => {
    installSignal.throwIfAborted()
    let output = ''
    let stdout = ''
    const child = spawn(command, [...prefix, ...args, '--no-update-notifier'], {
      cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', chunk => output = (output + String(chunk)).slice(-8000))
    child.stdout.on('data', chunk => stdout = (stdout + String(chunk)).slice(-8000))
    let failure: Error | undefined
    let termination: ReturnType<typeof globalThis.setTimeout> | undefined
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid)
        return
      if (process.platform === 'win32') {
        child.kill(signal)
        return
      }
      try { process.kill(-child.pid, signal) }
      catch (error) {
        // The process group can finish between cancellation and the signal.
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          failure = error instanceof Error ? error : new Error(String(error))
          child.kill(signal)
        }
      }
    }
    const abort = () => {
      failure = Object.assign(new Error('Dependency download cancelled.'), { name: 'AbortError', code: 'ABORT_ERR', cause: installSignal.reason })
      // POSIX launchers can spawn npm as a child. Stop the entire private process group.
      kill('SIGTERM')
      termination = globalThis.setTimeout(kill, 1000, 'SIGKILL')
      termination.unref()
    }
    child.on('error', error => failure ??= error)
    installSignal.addEventListener('abort', abort, { once: true })
    // Wait for all pipe holders to terminate before removing staging files.
    child.once('close', (code) => {
      installSignal.removeEventListener('abort', abort)
      if (termination)
        globalThis.clearTimeout(termination)
      if (failure)
        reject(failure)
      else if (code === 0)
        resolve(stdout)
      else
        reject(new Error(`Dependency download failed (${code}). ${output.trim()}`))
    })
  })
  const config = Object.fromEntries(Object.entries(env).map(([name, value]) => [name.toLowerCase(), value]))
  // --prefix changes npm's default global config path. Keep the caller's original path.
  const globalConfig = config.npm_config_globalconfig ?? (await run(['config', 'get', 'globalconfig', '--loglevel=error'])).trim()
  if (!globalConfig || /[\r\n\0]/.test(globalConfig))
    throw new Error('npm returned an invalid global configuration path.')
  if (projectConfig)
    await writeFile(join(directory, '.npmrc'), await readFile(projectConfig), { mode: 0o600 })
  try {
    // Original cwd preserves relative certificate paths. Explicit prefix contains all install writes.
    await run(['install', '--prefix', directory, '--globalconfig', globalConfig, '--install-links', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund', '--save-exact', '--loglevel=error', ...packages])
  }
  finally {
    // Project config can contain credentials. Never retain it in the published cache.
    await rm(join(directory, '.npmrc'), { force: true })
  }
}

async function ownerIsGone(lock: string): Promise<boolean> {
  const owner = await readFile(join(lock, 'owner'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT')
      return undefined
    throw error
  })
  if (!owner) {
    // A process may have created the directory but not written its PID yet.
    const info = await stat(lock).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT')
        return undefined
      throw error
    })
    return !!info && Date.now() - info.mtimeMs > 30_000
  }
  const pid = Number(owner)
  if (!Number.isInteger(pid) || pid <= 0)
    throw new Error(`Invalid dependency cache lock: ${lock}`)
  try {
    process.kill(pid, 0)
    return false
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH')
      return true
    throw error
  }
}

/** Serializes package or browser publication across CLI processes. */
export async function withRuntimeDownloadLock<T>(lock: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  await mkdir(dirname(lock), { recursive: true, mode: 0o700 })
  const deadline = Date.now() + 300_000
  while (true) {
    const acquired = await mkdir(lock, { mode: 0o700 }).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST')
        return false
      throw error
    })
    if (acquired)
      break
    if (await ownerIsGone(lock)) {
      // Only one waiter may recover a dead owner. Recheck after winning recovery.
      await withRuntimeDownloadLock(`${lock}.recovery`, async () => {
        if (await ownerIsGone(lock))
          await rm(lock, { recursive: true, force: true })
      }, signal)
    }
    if (Date.now() > deadline)
      throw new Error(`Dependency download timed out. Check the cache lock: ${lock}`)
    await setTimeout(100, undefined, { signal })
  }
  try {
    await writeFile(join(lock, 'owner'), String(process.pid))
    signal?.throwIfAborted()
    return await operation()
  }
  finally {
    await rm(lock, { recursive: true, force: true })
  }
}

/** Atomic publication keeps failed or interrupted installs out of the reusable cache. */
export async function downloadRuntimePackages(packages: Record<string, string>, options: RuntimeDownloadOptions = {}): Promise<(specifier: string) => string> {
  const specs = Object.entries(packages).sort(([a], [b]) => a.localeCompare(b)).map(([name, version]) => {
    if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(version))
      throw new Error(`Invalid dependency pin: ${name}@${version}`)
    return `${name}@${version}`
  })
  const env = { ...process.env, ...options.env }
  // Lighthouse initializes Sentry only in its own CLI. Library audits never use it.
  // Exclude that graph before npm resolves it, rather than pruning after download.
  const libraryAudit = Object.hasOwn(packages, 'lighthouse')
  const policy = libraryAudit ? 'lighthouse-library-v1' : undefined
  const key = createHash('sha256').update(JSON.stringify([specs, process.platform, process.arch, process.versions.modules, ...(policy ? [policy] : [])])).digest('hex').slice(0, 20)
  const cache = options.cacheDir ?? runtimeCacheDirectory(env)
  await prepareRuntimeCache(cache)
  const destination = join(cache, key)
  const ready = join(destination, 'ready')
  const resolve = (directory = destination) => {
    const require = createRequire(join(directory, 'package.json'))
    return (specifier: string) => pathToFileURL(require.resolve(specifier)).href
  }
  options.signal?.throwIfAborted()
  if (existsSync(ready) && !options.validate)
    return resolve()
  return withRuntimeDownloadLock(`${destination}.lock`, async () => {
    const staging = `${destination}.${randomUUID()}.tmp`
    try {
      if (existsSync(ready)) {
        const validation = options.validate ? await options.validate(resolve()) : { _tag: 'Valid' as const }
        if (validation._tag === 'Valid')
          return resolve()
        options.logger?.warn?.(`Cached dependency verification failed: ${validation.reason} Downloading again.`)
      }
      // Recover a cache interrupted before its ready marker was published.
      await rm(destination, { recursive: true, force: true })
      await mkdir(staging, { mode: 0o700 })
      if (libraryAudit) {
        const excluded = join(staging, 'lighthouse-no-telemetry')
        await mkdir(excluded)
        // No exports: accidental telemetry use fails explicitly instead of silently succeeding.
        await writeFile(join(excluded, 'package.json'), JSON.stringify({ name: '@sentry/node', version: '0.0.0', private: true, exports: {} }))
      }
      await writeFile(join(staging, 'package.json'), JSON.stringify({
        private: true,
        type: 'module',
        ...(libraryAudit ? { overrides: { lighthouse: { '@sentry/node': `file:${join(staging, 'lighthouse-no-telemetry')}` } } } : {}),
      }))
      options.logger?.info?.(`Downloading dependencies: ${specs.join(', ')}`)
      await (options.install ?? ((directory, pins, signal) => installPackages(directory, pins, env, signal)))(staging, specs, options.signal)
      options.signal?.throwIfAborted()
      if (options.validate) {
        const validation = await options.validate(resolve(staging))
        if (validation._tag === 'Invalid')
          throw new Error(`${validation.reason} Retry the download.`)
      }
      await writeFile(join(staging, 'ready'), JSON.stringify(specs))
      await rename(staging, destination)
      return resolve()
    }
    finally {
      await rm(staging, { recursive: true, force: true })
    }
  }, options.signal)
}

export function downloadDependencies(names: string[], options: RuntimeDownloadOptions = {}) {
  return downloadRuntimePackages(Object.fromEntries(names.map(name => [name, versions[name]!])), options)
}

export function runtimePackageVersion(name: string): string {
  const version = versions[name]
  if (!version)
    throw new Error(`Dependency has no version pin: ${name}`)
  return version
}
