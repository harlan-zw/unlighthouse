import { describe, expect, it } from 'vitest'
import { createScanEventStream } from '../app/features/scan/event-stream'

describe('scan event stream', () => {
  it('preserves the event envelope timestamp during replay', async () => {
    const timestamp = '2026-08-10T02:15:30.000Z'
    const stream = createScanEventStream({
      scanId: 'scan-id',
      requestFrame: callback => callback(),
      async* tailEvents() {
        yield { event: 'scan:complete', payload: { scanId: 'scan-id' }, timestamp }
      },
    })

    stream.startStream()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(stream.events.value[0]?.timestamp).toBe(Date.parse(timestamp))
  })
})
