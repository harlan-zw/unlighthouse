import type { Device, PageStatus, ScanStatus } from './types.ts'

export type UnlighthouseEvent =
  | { type: 'scan:status', scanId: string, status: ScanStatus, error?: string }
  | { type: 'scan:progress', scanId: string, discovered: number, queued: number, done: number, failed: number, skipped: number }
  | { type: 'page:discovered', scanId: string, url: string, template: string }
  | { type: 'page:status', scanId: string, url: string, device: Device, status: PageStatus, score?: number | null, error?: string }
  | { type: 'log', scanId?: string, level: 'info' | 'warn' | 'error', message: string }

type Listener = (event: UnlighthouseEvent) => void

export class EventBus {
  #listeners = new Set<Listener>()

  on(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  emit(event: UnlighthouseEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event)
      }
      catch {}
    }
  }
}
