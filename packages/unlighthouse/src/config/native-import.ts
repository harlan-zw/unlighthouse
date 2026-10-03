import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { downloadDependencies } from '../runtime-download'

/** C12 only calls import(). Keep its compiler optional on Node 24. */
export function createJiti(filename: string, options: Record<string, unknown> = {}) {
  return {
    async import<T = unknown>(specifier: string, importOptions: { default?: boolean } = {}): Promise<T> {
      const configModule = import.meta.resolve('unlighthouse/config')
      const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
          if (specifier === 'unlighthouse/config')
            return { url: configModule, shortCircuit: true }
          return nextResolve(specifier, context)
        },
      })
      try {
        const module = await import(pathToFileURL(specifier).href, specifier.endsWith('.json') ? { with: { type: 'json' } } : undefined)
        return (importOptions.default ? module.default ?? module : module) as T
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (!['ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX', 'ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT', 'ERR_UNKNOWN_FILE_EXTENSION'].includes(code ?? ''))
          throw error
        const resolve = await downloadDependencies(['jiti'])
        const { createJiti: createCompiler } = await import(resolve('jiti')) as typeof import('jiti')
        return createCompiler(filename, { ...options, alias: { 'unlighthouse/config': fileURLToPath(configModule), ...options.alias as Record<string, string> } }).import<T>(specifier, importOptions.default ? { default: true } : {})
      }
      finally {
        hooks.deregister()
      }
    },
  }
}
