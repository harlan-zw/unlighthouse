import { createRouter, toRouteMatcher } from 'radix3'

interface CreateFilterOptions {
  include?: (string | RegExp)[]
  exclude?: (string | RegExp)[]
}

export function createFilter(options: CreateFilterOptions = {}): (path: string) => boolean {
  const include = options.include || []
  const exclude = options.exclude || []
  if (include.length === 0 && exclude.length === 0)
    return () => true

  return function (path: string): boolean {
    // check include first
    for (const v of [{ rules: include, result: true }, { rules: exclude, result: false }]) {
      const regexRules = v.rules.filter(r => r instanceof RegExp) as RegExp[]
      if (regexRules.some(r => r.test(path)))
        return v.result

      const stringRules = v.rules.filter(r => typeof r === 'string') as string[]
      if (stringRules.length > 0) {
        const routes = {}
        for (const r of stringRules) {
          // quick scan of literal string matches
          if (r === path)
            return v.result

          // need to flip the array data for radix3 format, true value is arbitrary
          // @ts-expect-error untyped
          routes[r] = true
        }
        const routeRulesMatcher = toRouteMatcher(createRouter({ routes, strictTrailingSlash: false }))
        if (routeRulesMatcher.matchAll(path).length > 0)
          return Boolean(v.result)
      }
    }
    return include.length === 0
  }
}

// types of file extensions that would return a HTML mime type
const HTML_EXPLICIT_EXTENSIONS = [
  // html
  '.html',
  '.htm',
  // php
  '.php',
  // asp
  '.asp',
  '.aspx',
]
const FILE_MATCH_REGEX = /\.([0-9a-z])+$/i

export function isImplicitOrExplicitHtml(path: string): boolean {
  const lastPathSegment = path.split('/').pop() || path
  // if it ends with a slash, then we assume it's a index HTML
  if (lastPathSegment.endsWith('/'))
    return true // implicit
  const extension = lastPathSegment?.match(FILE_MATCH_REGEX)?.[0]
  return !extension || HTML_EXPLICIT_EXTENSIONS.includes(extension)
}
