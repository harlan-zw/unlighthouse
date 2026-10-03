import type { RuntimeDownloadOptions } from './runtime-download'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadDependencies, runtimePackageVersion } from './runtime-download'

export async function resolveUiClient(options: RuntimeDownloadOptions = {}): Promise<string> {
  // Reuse the workspace UI during development, or an exact installed release.
  const installed = (() => {
    try {
      return fileURLToPath(import.meta.resolve('@unlighthouse/ui'))
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND')
        return undefined
      throw error
    }
  })()
  if (installed) {
    const pkg = JSON.parse(await readFile(join(dirname(installed), '..', 'package.json'), 'utf8'))
    if (pkg.version === runtimePackageVersion('@unlighthouse/ui'))
      return installed
  }
  const resolve = await downloadDependencies(['@unlighthouse/ui'], options)
  return fileURLToPath(resolve('@unlighthouse/ui'))
}
