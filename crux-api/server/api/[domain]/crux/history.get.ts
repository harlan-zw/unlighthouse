import { createError, defineCachedEventHandler } from '#imports'
import { getRouterParam } from 'h3'
import { fetchCrux } from '../../../app/services/crux'

export default defineCachedEventHandler(async (event) => {
  const domain = getRouterParam(event, 'domain', { decode: true })
  if (!domain) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Site not found',
    })
  }
  return fetchCrux(domain)
}, {
  base: 'crux2',
  swr: true,
  shouldBypassCache: () => true, // !!import.meta.dev,
  getKey: event => getRouterParam(event, 'domain', { decode: true }),
  maxAge: 60 * 60,
  staleMaxAge: 24 * 60 * 60,
})
