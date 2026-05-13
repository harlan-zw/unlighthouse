// Adapter-private hook bus. Scoped per adapter; does not pollute global HookMap.
// See v1.md D-019.

export interface AdapterHooks<T extends Record<string, (...args: any[]) => unknown | Promise<unknown>>> {
  on: <K extends keyof T>(event: K, handler: T[K]) => () => void
  emit: <K extends keyof T>(event: K, ...args: Parameters<T[K]>) => Promise<void>
  /** Subscribe to all events (debug / tracing). */
  any: (handler: (event: keyof T, ...args: unknown[]) => void) => () => void
}

export function createAdapterHooks<T extends Record<string, (...args: any[]) => unknown | Promise<unknown>>>(): AdapterHooks<T> {
  const handlers = new Map<keyof T, Set<(...args: unknown[]) => unknown | Promise<unknown>>>()
  const anyHandlers = new Set<(event: keyof T, ...args: unknown[]) => void>()

  const on: AdapterHooks<T>['on'] = (event, handler) => {
    let set = handlers.get(event)
    if (!set) {
      set = new Set()
      handlers.set(event, set)
    }
    const fn = handler as unknown as (...args: unknown[]) => unknown | Promise<unknown>
    set.add(fn)
    return () => {
      set!.delete(fn)
    }
  }

  const emit: AdapterHooks<T>['emit'] = async (event, ...args) => {
    for (const h of anyHandlers)
      h(event, ...args)
    const set = handlers.get(event)
    if (!set || set.size === 0)
      return
    await Promise.all(Array.from(set, h => Promise.resolve(h(...args))))
  }

  const any: AdapterHooks<T>['any'] = (handler) => {
    anyHandlers.add(handler)
    return () => {
      anyHandlers.delete(handler)
    }
  }

  return { on, emit, any }
}
