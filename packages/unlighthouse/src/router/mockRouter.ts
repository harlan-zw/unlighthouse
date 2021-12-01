import { parse } from 'regexparam'
import type { RouteDefinition, MockRouter } from 'unlighthouse-utils'

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
