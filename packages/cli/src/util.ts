import { URL } from 'url'
import type { UserConfig } from '@unlighthouse/core'
import { pick } from 'lodash-es'
import { handleError } from './errors'
import type { CiOptions, CliOptions } from './types'

export const isValidUrl = (s: string) => {
  try {
    const url = new URL(s)
    return !!url
  }
  catch (err) {
    return false
  }
}

export const validateOptions = (resolvedOptions: UserConfig) => {
  if (!resolvedOptions.site)
    return handleError('Please provide a site to scan with --site <url>.')

  if (!isValidUrl(resolvedOptions.site))
    return handleError('Please provide a valid site URL.')
}

export function pickOptions(options: CiOptions|CliOptions): UserConfig {
  if (options.noCache)
    options.cache = true

  return pick(options, [
    // root level options
    'scanner.samples',
    'site',
    'root',
    'configFile',
    'debug',
    'cache',
    'outputPath',
  ])
}
