declare module 'launch-editor' {
  function launch(file: string): Promise<boolean>
  export default launch
}

declare module '@nuxt/utils' {
  import type { RouteDefinition } from '@unlighthouse/core'

  export function createRoutes(options: any): RouteDefinition[]
}

declare module '@nuxt/cli/dist/cli-index.js' {
  export function successBox(messages: string, title: string): string
}

declare module 'lighthouse/lighthouse-core/lib/median-run.js' {
  export function computeMedianRun(reports: any[]): string
}
