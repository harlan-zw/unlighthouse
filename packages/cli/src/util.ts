import { URL } from 'url'
import type { UserConfig } from '@unlighthouse/core'
import { handleError } from './errors'

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
  if (!resolvedOptions.host)
    return handleError('Please provide a site to scan with --host <url>.')

  if (!isValidUrl(resolvedOptions.host))
    return handleError('Please provide a valid host URL.')
}
