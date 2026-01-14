import type { RouteDefinition } from '../types'
import { resolve } from 'pathe'
import { normalizeURL, withoutTrailingSlash, withTrailingSlash } from 'ufo'

/**
 * From https://github.com/nuxt/nuxt.js/blob/dev/packages/utils/src/route.js
 */

type NuxtRoute = RouteDefinition & {
  children?: any[]
  pathToRegexpOptions?: any
}

const DYNAMIC_ROUTE_REGEX = /^\/[:*]/

function getRoutePathExtension(key: string) {
  if (key === '_')
    return '*'

  if (key.startsWith('_'))
    return `:${key.substring(1)}`

  return key
}

function sortRoutes(routes: NuxtRoute[]) {
  routes.sort((a, b) => {
    if (!a.path.length)
      return -1

    if (!b.path.length)
      return 1

    // Order: /static, /index, /:dynamic
    // Match exact route before index: /login before /index/_slug
    if (a.path === '/')
      return DYNAMIC_ROUTE_REGEX.test(b.path) ? -1 : 1

    if (b.path === '/')
      return DYNAMIC_ROUTE_REGEX.test(a.path) ? 1 : -1

    let i
    let res = 0
    let y = 0
    let z = 0
    const _a = a.path.split('/')
    const _b = b.path.split('/')
    for (i = 0; i < _a.length; i++) {
      if (res !== 0)
        break

      y = _a[i] === '*' ? 2 : _a[i].includes(':') ? 1 : 0
      z = _b[i] === '*' ? 2 : _b[i].includes(':') ? 1 : 0
      res = y - z
      // If a.length >= b.length
      if (i === _b.length - 1 && res === 0) {
        // unless * found sort by level, then alphabetically
        res = _a[i] === '*'
          ? -1
          : (
              _a.length === _b.length ? a.path.localeCompare(b.path) : (_a.length - _b.length)
            )
      }
    }

    if (res === 0) {
      // unless * found sort by level, then alphabetically
      res = (_a[i - 1] === '*' && _b[i])
        ? 1
        : (
            _a.length === _b.length ? a.path.localeCompare(b.path) : (_a.length - _b.length)
          )
    }
    return res
  })

  routes.forEach((route) => {
    if (route.children)
      sortRoutes(route.children)
  })

  return routes
}

export function createRoutes(options: { files: string[], srcDir: string, pagesDir?: string, routeNameSplitter?: string, supportedExtensions: string[], trailingSlash: boolean }) {
  const {
    files,
    srcDir,
    pagesDir = '',
    routeNameSplitter = '-',
    supportedExtensions = ['vue', 'js'],
    trailingSlash,
  } = options
  const routes: NuxtRoute[] = []
  files.forEach((file) => {
    const keys = file
      .replace(new RegExp(`^${pagesDir}`), '')
      .replace(new RegExp(`\\.(${supportedExtensions.join('|')})$`), '')
      .replace(/\/{2,}/g, '/')
      .split('/')
      .slice(1)
    const route: NuxtRoute = { name: '', path: '', component: resolve(srcDir, file) }
    let parent = routes
    keys.forEach((key, i) => {
      // remove underscore only, if its the prefix
      const sanitizedKey = key.startsWith('_') ? key.substr(1) : key

      route.name = route.name
        ? route.name + routeNameSplitter + sanitizedKey
        : sanitizedKey
      route.name += key === '_' ? 'all' : ''
      route.chunkName = file.replace(new RegExp(`\\.(${supportedExtensions.join('|')})$`), '')
      const child = parent.find(parentRoute => parentRoute.name === route.name)

      if (child) {
        child.children = child.children || []
        parent = child.children
        route.path = ''
      }
      else if (key === 'index' && i + 1 === keys.length) {
        route.path += i > 0 ? '' : '/'
      }
      else {
        route.path += `/${normalizeURL(getRoutePathExtension(key))}`
        if (key.startsWith('_') && key.length > 1)
          route.path += '?'
      }
    })
    if (trailingSlash !== undefined) {
      route.pathToRegexpOptions = { ...route.pathToRegexpOptions, strict: true }
      if (trailingSlash && !route.path.endsWith('*'))
        route.path = withTrailingSlash(route.path)
      else
        route.path = withoutTrailingSlash(route.path)
    }

    parent.push(route)
  })

  sortRoutes(routes)
  return cleanChildrenRoutes(routes, false, routeNameSplitter, trailingSlash)
}

function cleanChildrenRoutes(routes: NuxtRoute[], isChild = false, routeNameSplitter = '-', trailingSlash: boolean, parentRouteName = '') {
  const regExpIndex = new RegExp(`${routeNameSplitter}index$`)
  const regExpParentRouteName = new RegExp(`^${parentRouteName}${routeNameSplitter}`)
  const routesIndex: string[][] = []
  routes.forEach((route) => {
    if (regExpIndex.test(route.name) || route.name === 'index') {
      const res = route.name.replace(regExpParentRouteName, '').split(routeNameSplitter)
      routesIndex.push(res)
    }
  })
  routes.forEach((route) => {
    route.path = isChild ? route.path.replace('/', '') : route.path
    if (route.path.includes('?')) {
      if (route.name.endsWith(`${routeNameSplitter}index`))
        route.path = route.path.replace(/\?\/?$/, trailingSlash ? '/' : '')

      const names = route.name.replace(regExpParentRouteName, '').split(routeNameSplitter)
      const paths = route.path.split('/')
      if (!isChild)
        paths.shift()
      // clean first / for parents
      routesIndex.forEach((r) => {
        const i = r.indexOf('index')
        if (i < paths.length) {
          for (let a = 0; a <= i; a++) {
            if (a === i)
              paths[a] = paths[a].replace('?', '')

            if (a < i && names[a] !== r[a])
              break
          }
        }
      })
      route.path = (isChild ? '' : '/') + paths.join('/')
    }
    route.name = route.name.replace(regExpIndex, '')
    if (route.children) {
      const defaultChildRoute = route.children.find(child => child.path === '/' || child.path === '')
      const routeName = route.name
      if (defaultChildRoute) {
        route.children.forEach((child) => {
          if (child.path !== defaultChildRoute.path) {
            const parts = child.path.split('/')
            parts[1] = parts[1].endsWith('?') ? parts[1].substr(0, parts[1].length - 1) : parts[1]
            child.path = parts.join('/')
          }
        })
        // @ts-expect-error untyped
        delete route.name
      }
      route.children = cleanChildrenRoutes(route.children, true, routeNameSplitter, trailingSlash, routeName)
    }
  })
  return routes
}
