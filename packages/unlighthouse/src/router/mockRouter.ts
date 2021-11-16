import { parse } from 'regexparam'
import { RouteDefinition, MockRouter } from '@shared'

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
