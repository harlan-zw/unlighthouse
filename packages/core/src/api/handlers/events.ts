// events.* handlers — streaming AsyncGenerators.

import type { CommandOutput, EventsSubscribe, EventsTail, HookEvent } from '@unlighthouse/contracts'
import type { Handler } from './types'
import { gunzipSync } from 'node:zlib'

function makeFilter(events?: string[]) {
  if (!events?.length)
    return () => true
  const set = new Set(events)
  return (e: HookEvent) => set.has(e.event)
}

export const eventsSubscribe: Handler<typeof EventsSubscribe> = {
  command: {} as typeof EventsSubscribe,
  run(input, ctx) {
    const filter = makeFilter(input.events)
    async function* gen(): AsyncIterable<CommandOutput<typeof EventsSubscribe>> {
      const session = ctx.core.session()
      if (!session)
        return
      if (input.scanId && session.scanId !== input.scanId)
        return
      // Replay buffered events first (subject to the same event-name filter).
      if (input.replay && input.replay > 0) {
        for (const event of session.replay(input.replay)) {
          if (filter(event))
            yield event as CommandOutput<typeof EventsSubscribe>
        }
      }
      for await (const event of session.events) {
        if (filter(event))
          yield event as CommandOutput<typeof EventsSubscribe>
      }
    }
    return gen()
  },
}

export const eventsTail: Handler<typeof EventsTail> = {
  command: {} as typeof EventsTail,
  run(input, ctx) {
    const filter = makeFilter(input.events)
    async function* gen(): AsyncIterable<CommandOutput<typeof EventsTail>> {
      const blobKey = `scans/${input.scanId}/events.jsonl.gz`
      const blob = await ctx.storage.blobs.get(blobKey)
      if (blob) {
        const text = gunzipSync(blob).toString('utf-8')
        for (const line of text.split('\n')) {
          if (!line.trim())
            continue
          const event = JSON.parse(line) as HookEvent
          if (filter(event))
            yield event as CommandOutput<typeof EventsTail>
        }
      }
      if (input.follow) {
        const session = ctx.core.session()
        if (session && session.scanId === input.scanId) {
          for await (const event of session.events) {
            if (filter(event))
              yield event as CommandOutput<typeof EventsTail>
          }
        }
      }
    }
    return gen()
  },
}
