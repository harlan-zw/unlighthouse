import type { LighthouseScanOptions, LighthouseScanResult } from './lighthouse'

export interface QueuedScan {
  id: string
  options: LighthouseScanOptions
  status: 'queued' | 'processing' | 'completed' | 'failed'
  result?: LighthouseScanResult
  error?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export interface QueueStats {
  queued: number
  processing: number
  completed: number
  failed: number
  totalProcessed: number
  averageProcessingTime: number
  maxConcurrency: number
}

/**
 * Queue system for managing concurrent Lighthouse scans.
 * Ensures accurate metrics by limiting concurrent scans and managing resources.
 */
export class ScanQueue {
  private queue: QueuedScan[] = []
  private processing: Map<string, QueuedScan> = new Map()
  private completed: Map<string, QueuedScan> = new Map()
  private maxConcurrency: number
  private nextId = 0
  private totalProcessed = 0
  private totalProcessingTime = 0

  constructor(maxConcurrency: number = 3) {
    this.maxConcurrency = maxConcurrency
  }

  /**
   * Add a scan to the queue
   */
  async enqueue(options: LighthouseScanOptions): Promise<QueuedScan> {
    const id = `scan-${Date.now()}-${this.nextId++}`

    const scan: QueuedScan = {
      id,
      options,
      status: 'queued',
      createdAt: Date.now(),
    }

    this.queue.push(scan)

    // Start processing if we have capacity
    this.processNext()

    return scan
  }

  /**
   * Get a scan by ID
   */
  getScan(id: string): QueuedScan | undefined {
    const queued = this.queue.find(s => s.id === id)
    if (queued)
      return queued

    const processing = this.processing.get(id)
    if (processing)
      return processing

    return this.completed.get(id)
  }

  /**
   * Process next scan in queue if we have capacity
   */
  private processNext(): void {
    // Check if we have capacity
    if (this.processing.size >= this.maxConcurrency)
      return

    // Get next scan from queue
    const scan = this.queue.shift()
    if (!scan)
      return

    // Mark as processing
    scan.status = 'processing'
    scan.startedAt = Date.now()
    this.processing.set(scan.id, scan)
  }

  /**
   * Mark a scan as started (called by the worker)
   */
  startProcessing(id: string): void {
    const scan = this.processing.get(id)
    if (scan) {
      scan.status = 'processing'
      scan.startedAt = Date.now()
    }
  }

  /**
   * Complete a scan with results
   */
  completeScan(id: string, result: LighthouseScanResult): void {
    const scan = this.processing.get(id)
    if (!scan)
      return

    scan.status = 'completed'
    scan.result = result
    scan.completedAt = Date.now()

    // Update stats
    if (scan.startedAt) {
      const processingTime = scan.completedAt - scan.startedAt
      this.totalProcessingTime += processingTime
      this.totalProcessed++
    }

    // Move to completed
    this.processing.delete(id)
    this.completed.set(id, scan)

    // Clean up old completed scans (keep last 100)
    if (this.completed.size > 100) {
      const oldestId = Array.from(this.completed.keys())[0]
      this.completed.delete(oldestId)
    }

    // Process next in queue
    this.processNext()
  }

  /**
   * Mark a scan as failed
   */
  failScan(id: string, error: string): void {
    const scan = this.processing.get(id) || this.queue.find(s => s.id === id)
    if (!scan)
      return

    scan.status = 'failed'
    scan.error = error
    scan.completedAt = Date.now()

    // Remove from processing or queue
    this.processing.delete(id)
    const queueIndex = this.queue.findIndex(s => s.id === id)
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1)
    }

    // Move to completed
    this.completed.set(id, scan)

    // Process next in queue
    this.processNext()
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const completedArray = Array.from(this.completed.values())
    const failed = completedArray.filter(s => s.status === 'failed').length
    const completed = completedArray.filter(s => s.status === 'completed').length

    return {
      queued: this.queue.length,
      processing: this.processing.size,
      completed,
      failed,
      totalProcessed: this.totalProcessed,
      averageProcessingTime: this.totalProcessed > 0
        ? Math.round(this.totalProcessingTime / this.totalProcessed)
        : 0,
      maxConcurrency: this.maxConcurrency,
    }
  }

  /**
   * Get current position in queue
   */
  getQueuePosition(id: string): number {
    const index = this.queue.findIndex(s => s.id === id)
    return index === -1 ? -1 : index + 1
  }

  /**
   * Update max concurrency
   */
  setMaxConcurrency(maxConcurrency: number): void {
    this.maxConcurrency = maxConcurrency

    // Process more scans if we increased concurrency
    while (this.processing.size < this.maxConcurrency && this.queue.length > 0) {
      this.processNext()
    }
  }
}

// Singleton instance
let scanQueue: ScanQueue | null = null

export function getScanQueue(): ScanQueue {
  if (!scanQueue) {
    // Default to 3 concurrent scans for accuracy
    scanQueue = new ScanQueue(3)
  }
  return scanQueue
}
