import { UnroutedRoute } from './types'

export function execRoute(path: string, result: UnroutedRoute) {
  let i = 0; const out = {}
  const matches = result.pattern.exec(path)
  while (i < result.keys.length) { // @ts-ignore
    out[result.keys[i]] = matches[++i] || null
  }
  return out
}
