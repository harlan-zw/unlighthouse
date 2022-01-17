import { URL } from 'url'
import type { UserConfig } from '@unlighthouse/core'
import { pick } from 'lodash-es'
import defu from 'defu'
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
  const picked: Record<string, any> = {}
  if (options.noCache)
    picked.cache = true

  if (options.enableJavascript) {
    picked.scanner = {
      skipJavascript: false,
    }
  }
  else if (options.disableJavascript) {
    picked.scanner = {
      skipJavascript: true,
    }
  }

  return defu(
    pick(options, [
      // root level options
      'scanner.samples',
      'site',
      'root',
      'configFile',
      'debug',
      'cache',
      'outputPath',
    ]),
    picked,
  )
}
