import { MockRouter, RouteDefinition } from 'unlighthouse-utils'
import { createRouter, createMemoryHistory, RouteRecordRaw } from 'vue-router'

/**
 * A mocker router using vue-router as the implementation.
 *
 * Needed for Vite and next.js.
 *
 * @param routeDefinitions
 */
export const createMockVueRouter: (routeDefinitions: RouteDefinition[]) => MockRouter
    = (routeDefinitions) => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: routeDefinitions as RouteRecordRaw[],
      })

      return {
        match(path: string) {
          const { name } = router.resolve(path) as RouteDefinition
          return routeDefinitions.filter(d => d.name === name)[0]
        },
      }
    }
