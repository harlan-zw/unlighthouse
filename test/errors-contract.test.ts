import { describe, expect, it } from 'vitest'
import {
  createErrorEnvelope,
  errorFromEnvelope,
  registerErrorCodeDefaults,
  statusForErrorCode,
  UnlighthouseError,
  UnlighthouseErrorEnvelopeSchema,
} from '@unlighthouse/contracts/errors'

describe('error contract', () => {
  it('serializes UnlighthouseError to the public envelope shape', () => {
    const envelope = createErrorEnvelope(new UnlighthouseError({
      code: 'SCAN_NOT_FOUND',
      message: 'missing',
      details: { scanId: 'abc' },
    }))

    expect(UnlighthouseErrorEnvelopeSchema.safeParse(envelope).success).toBe(true)
    expect(envelope.error).toMatchObject({
      code: 'SCAN_NOT_FOUND',
      message: 'missing',
      statusCode: 404,
      category: 'fatal',
      details: { scanId: 'abc' },
    })
  })

  it('supports extension codes with registered defaults', () => {
    registerErrorCodeDefaults('PACK_NOT_FOUND', {
      statusCode: 404,
      message: 'Pack not found',
      category: 'fatal',
    })
    const envelope = createErrorEnvelope(new UnlighthouseError({ code: 'PACK_NOT_FOUND' }))

    expect(statusForErrorCode('PACK_NOT_FOUND')).toBe(404)
    expect(envelope.error.code).toBe('PACK_NOT_FOUND')
    expect(envelope.error.message).toBe('Pack not found')
    expect(errorFromEnvelope(envelope)).toBeInstanceOf(UnlighthouseError)
  })

  it('maps plain errors to INTERNAL without exposing details by default', () => {
    const envelope = createErrorEnvelope(new Error('database password leaked'))

    expect(envelope.error.code).toBe('INTERNAL')
    expect(envelope.error.message).toBe('An unrecoverable internal error occurred.')
    expect(envelope.error.statusCode).toBe(500)
  })
})
