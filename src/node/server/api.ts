import { resolve } from 'path'
import fs from 'fs'
import { createRouter, useBody, useParams } from 'unrouted'
import cors from 'cors'
import { RouteDefinition } from '../../../packages/nuxt-module-utils/types'
import { PLUGIN_PATH_PREFIX } from '../../core'
import { RouteReport } from '../../types'

export type RuntimeAppData = {
  processRoute: (route: RouteDefinition) => void
  onAppVisit: () => void
  routes: () => Promise<RouteDefinition[]>
  reports: () => Promise<RouteReport[]>
  stats: () => Promise<any>
}

export function createApi(appData: RuntimeAppData) {
  const { serve, group, handle, get } = createRouter({
    prefix: PLUGIN_PATH_PREFIX,
    hooks: {
      'serve:before-route:/': () => {
        // start processing when the user visits the page
        appData.onAppVisit()
      },
    },
  })

  get('*', cors())

  group('/api', ({ get, post }) => {
    get('reports', () => appData.reports())
    get('reports/:id', async() => {
      const { id } = useParams<{ id: string }>()
      const report = (await appData.reports())
        .filter(report => report.reportId === id)[0]
      return fs.readFileSync(report.reportHtml, 'utf-8')
    })

    get('routes', () => appData.routes())
    get('stats', () => appData.stats())

    post('known-routes', async() => {
      appData.processRoute(useBody<RouteDefinition>())
      return { success: true }
    })
  })
  serve('/', resolve(__dirname, '../../../dist/client'))

  return handle
}
