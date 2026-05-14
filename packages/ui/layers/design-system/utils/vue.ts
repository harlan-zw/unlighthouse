import type { ComputedRef, VNode } from 'vue'
import { computed, inject, provide } from 'vue'

/**
 * Helper function to check if the current setup-script component has a named listener
 *
 * @param name
 */
export function hasListener(name: string): boolean {
  const instance = getCurrentInstance()
  const handler = `on${name.slice(0, 1).toUpperCase()}${name.slice(1)}`
  return !!instance?.vnode.props && (handler in instance.vnode.props)
}

type Slot = (() => VNode[]) | undefined

/**
 * Helper function to render a slot's text content
 *
 * @param slot
 */
export function getSlotTextContent(slot: Slot): string {
  if (!slot) {
    return ''
  }
  return slot().map((node: VNode): string => {
    if (typeof node.children === 'string') {
      return node.children
    }
    else if (Array.isArray(node.children)) {
      return getSlotTextContent(() => node.children as VNode[])
    }
    return ''
  }).join(' ').trim()
}

/**
 * Creates a overridable context provider composable with defaults
 *
 * Its purpose is to provide an upstream set of values that can be
 * overridden by downstream child components, and in turn pass those
 * values on in turn.
 *
 * The props at each level should be passed in to the context at that
 * level so that the values can be merged with the parent values.
 *
 * @example
 *
 * // create new provider
 * const useFormLayout = createContextHook<FormContext>('form-layout', {
 *   orientation: 'vertical',
 *   labelWidth: undefined,
 *   inputSize: 'md',
 * })
 *
 * // form (sets and uses orientation)
 * const { orientation } = useFormLayout(props)
 *
 * // field (receives orientation and overrides input size)
 * const { orientation } = useFormLayout(props)
 *
 * // input (receives modified input size)
 * const { inputSize } = useFormLayout(props)
 */
export function makeProvider<T extends Record<string, any>>(
  key: string,
  defaults: T,
) {
  return function useContext<P extends Partial<T>>(props: P) {
    // symbol
    const symbol = Symbol(key)

    // Get parent context or use defaults
    const parentContext = inject<ComputedRef<T> | T>(symbol, defaults)

    // Create merged context that automatically watches props
    const context = computed<T>(() => {
      const parentValues = 'value' in parentContext
        ? parentContext.value
        : parentContext

      // Filter out undefined values from props
      const filteredProps = Object.fromEntries(
        Object.entries(props).filter(([_, v]) => v !== undefined),
      )

      // Merge parent values with props
      return {
        ...parentValues,
        ...filteredProps,
      }
    })

    // Provide the merged context
    provide(symbol, context)

    // Return computed refs for each property
    return Object.fromEntries(
      Object.keys(defaults).map(key => [
        key,
        computed(() => context.value[key]),
      ]),
    ) as { [K in keyof T]: ComputedRef<T[K]> }
  }
}

export function deepUnref<T>(obj: T): T {
  const value = toValue(obj)

  if (!value || typeof value !== 'object') {
    return value as any
  }

  if (Array.isArray(value)) {
    return value.map(deepUnref) as any
  }

  const result: Record<string, any> = {}
  for (const key in value) {
    // Skip Vue's internal ref properties
    if (key.startsWith('__v_') || key === '_rawValue' || key === '_value') {
      continue
    }
    result[key] = deepUnref(value[key])
  }
  return result as T
}
