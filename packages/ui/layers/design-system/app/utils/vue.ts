import type { VNode } from 'vue'
import { getCurrentInstance, toValue } from 'vue'

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

export function deepUnref<T>(obj: T): T {
  const value = toValue(obj)

  if (!value || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(deepUnref) as T
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
