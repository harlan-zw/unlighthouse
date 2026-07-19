import { describe, expect, it } from 'vitest'
import { normalizeApiError } from '../app/composables/useApiError'

describe('normalizeApiError', () => {
  it('recovers typed domain metadata from Nuxt/h3 error causes', () => {
    const domain = Object.assign(new Error('No scan found'), {
      name: 'SCAN_NOT_FOUND',
      code: 'SCAN_NOT_FOUND',
      statusCode: 404,
      retryable: false,
    })
    const wrapped = Object.assign(new Error('No scan found', { cause: domain }), {
      statusCode: 404,
    })

    expect(normalizeApiError(wrapped)).toEqual({
      _tag: 'http',
      status: 404,
      code: 'SCAN_NOT_FOUND',
      title: 'Not found',
      message: 'No scan found',
      retryable: false,
    })
  })

  it('falls back to the wrapper status when no domain code survives', () => {
    const wrapped = Object.assign(new Error('Missing'), { statusCode: 404 })

    expect(normalizeApiError(wrapped)).toMatchObject({
      _tag: 'http',
      status: 404,
      code: 'HTTP_404',
      title: 'Not found',
    })
  })

  it('recognizes a wrapped browser network failure', () => {
    const wrapped = new Error('Request failed', { cause: new TypeError('Failed to fetch') })

    expect(normalizeApiError(wrapped)).toMatchObject({
      _tag: 'offline',
      code: 'OFFLINE',
      retryable: true,
    })
  })
})
