import { describe, expect, it, vi } from 'vitest'
import { retryD1IdempotentWrite } from '../src/storage/d1-r2'

describe('d1 idempotent write retry', () => {
  it('backs off and retries documented transient failures', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: Network connection lost'))
      .mockRejectedValueOnce(new Error('D1_ERROR: storage caused object to be reset'))
      .mockResolvedValue('written')
    const delays: number[] = []

    await expect(retryD1IdempotentWrite(operation, {
      sleep: async (milliseconds) => { delays.push(milliseconds) },
      random: () => 0.5,
    })).resolves.toBe('written')

    expect(operation).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([100, 200])
  })

  it('does not repeat unknown failures', async () => {
    const error = new Error('D1_ERROR: UNIQUE constraint failed')
    const operation = vi.fn().mockRejectedValue(error)

    await expect(retryD1IdempotentWrite(operation, {
      sleep: async () => {},
    })).rejects.toBe(error)
    expect(operation).toHaveBeenCalledOnce()
  })
})
