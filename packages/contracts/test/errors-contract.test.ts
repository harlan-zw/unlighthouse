import {
  createErrorEnvelope,
  errorFromEnvelope,
  statusForErrorCode,
  UnlighthouseError,
  UnlighthouseErrorEnvelopeSchema,
} from '@unlighthouse/contracts/errors'
import { describe, expect, it } from 'vitest'

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

  it('supports built-in pack codes without a mutable registry', () => {
    const envelope = createErrorEnvelope(new UnlighthouseError({ code: 'PACK_NOT_FOUND' }))

    expect(statusForErrorCode('PACK_NOT_FOUND')).toBe(404)
    expect(envelope.error.code).toBe('PACK_NOT_FOUND')
    expect(envelope.error.message).toBe('No registered pack matched the requested name.')
    expect(errorFromEnvelope(envelope)).toBeInstanceOf(UnlighthouseError)
  })

  it('supports extension codes through explicit error metadata', () => {
    const envelope = createErrorEnvelope(new UnlighthouseError({
      code: 'MY_PACK_FAILED',
      message: 'Custom pack failed',
      statusCode: 422,
      category: 'validation',
    }))

    expect(errorFromEnvelope(envelope)).toMatchObject({
      code: 'MY_PACK_FAILED',
      statusCode: 422,
      category: 'validation',
    })
  })

  it('maps plain errors to INTERNAL without exposing details by default', () => {
    const envelope = createErrorEnvelope(new Error('database password leaked'))

    expect(envelope.error.code).toBe('INTERNAL')
    expect(envelope.error.message).toBe('An unrecoverable internal error occurred.')
    expect(envelope.error.statusCode).toBe(500)
  })
})
