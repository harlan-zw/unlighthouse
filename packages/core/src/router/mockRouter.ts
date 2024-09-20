import type { MockRouter, RouteDefinition } from '../types'
import { parse } from 'regexparam'
import { useLogger } from '../logger'

/**
 * The default mock router using regexparam as the matcher
 *
 * Used by nuxt and the default route definition discoverer.
 *
 * @param routeDefinitions
 */
export const createMockRouter: (routeDefinitions: RouteDefinition[]) => MockRouter
  = (routeDefinitions: RouteDefinition[]) => {
    const logger = useLogger()
    const patterns = routeDefinitions
      .map((r) => {
        try {
          return {
            routeDefinition: r,
            matcher: parse(r.path),
          }
        }
        catch (e) {
          logger.debug('Failed to parse path', r.path, e)
        }
        return false
      })
      .filter(r => r !== false)

    return {
      match(path: string) {
        const matched = patterns.filter(p => p && p.matcher.pattern.test(path))
        if (matched.length > 0 && matched[0])
          return matched[0].routeDefinition

        return false
      },
    }
  }
