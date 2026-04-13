import type { LighthouseScanOptions } from './lighthouse'

/**
 * Lightweight queue specifically for Browserless requests.
 * Unlike scan-queue.ts which manages Chrome instances, this just rate-limits
 * requests to Browserless to prevent hitting API limits and manage costs.
 */
export interface BrowserlessQueueItem {
  id: string
  options: LighthouseScanOptions
  status: 'queued' | 'processing' | 'completed' | 'failed'
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
}

export class BrowserlessQueue {
  private queue: BrowserlessQueueItem[] = []
  private processing: Map<string, BrowserlessQueueItem> = new Map()
  private maxConcurrent: number
  private nextId = 0

  constructor(maxConcurrent: number = 10) {
    // Higher concurrency OK for Browserless since they handle the actual browsers
    // This just prevents overwhelming their API
    this.maxConcurrent = maxConcurrent
  }

  async enqueue(options: LighthouseScanOptions): Promise<string> {
    const id = `browserless-${Date.now()}-${this.nextId++}`

    const item: BrowserlessQueueItem = {
      id,
      options,
      status: 'queued',
      createdAt: Date.now(),
    }

    this.queue.push(item)
    return id
  }

  canProcess(): boolean {
    return this.processing.size < this.maxConcurrent
  }

  dequeue(): BrowserlessQueueItem | undefined {
    if (!this.canProcess())
      return undefined

    const item = this.queue.shift()
    if (item) {
      item.status = 'processing'
      item.startedAt = Date.now()
      this.processing.set(item.id, item)
    }
    return item
  }

  complete(id: string): void {
    const item = this.processing.get(id)
    if (item) {
      item.status = 'completed'
      item.completedAt = Date.now()
      this.processing.delete(id)
    }
  }

  fail(id: string, error: string): void {
    const item = this.processing.get(id)
    if (item) {
      item.status = 'failed'
      item.error = error
      item.completedAt = Date.now()
      this.processing.delete(id)
    }
  }

  getStats() {
    return {
      queued: this.queue.length,
      processing: this.processing.size,
      maxConcurrent: this.maxConcurrent,
    }
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max
  }
}

// Singleton
let browserlessQueue: BrowserlessQueue | null = null

export function getBrowserlessQueue(): BrowserlessQueue {
  if (!browserlessQueue) {
    browserlessQueue = new BrowserlessQueue(10)
  }
  return browserlessQueue
}
