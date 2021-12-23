import { parse } from 'regexparam'
import type { RouteDefinition, MockRouter } from '../types'

/**
 * The default mock router using regexparam as the matcher
 *
 * Used by nuxt and the default route definition discoverer.
 *
 * @param routeDefinitions
 */
export const createMockRouter: (routeDefinitions: RouteDefinition[]) => MockRouter
    = (routeDefinitions: RouteDefinition[]) => {
      const patterns = routeDefinitions.map((r) => {
        return {
          routeDefinition: r,
          matcher: parse(r.path),
        }
      })

      return {
        match(path: string) {
          return patterns.filter(p => p.matcher.pattern.test(path))[0]?.routeDefinition
        },
      }
    }
