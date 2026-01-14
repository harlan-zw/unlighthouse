export interface QueueItem<T> {
  id: string
  data: T
  status: 'queued' | 'processing' | 'completed' | 'failed'
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface QueueAdapter<T> {
  enqueue(data: T): Promise<string>
  dequeue(): Promise<QueueItem<T> | undefined>
  complete(id: string): Promise<void>
  fail(id: string, error: string): Promise<void>
  getStats?(): Promise<{ queued: number, processing: number }>
}

export class MemoryQueue<T> implements QueueAdapter<T> {
  private queue: QueueItem<T>[] = []
  private processing: Map<string, QueueItem<T>> = new Map()
  private nextId = 0
  private maxConcurrent: number

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent
  }

  async enqueue(data: T): Promise<string> {
    const id = `queue-${Date.now()}-${this.nextId++}`
    const item: QueueItem<T> = {
      id,
      data,
      status: 'queued',
      createdAt: Date.now(),
    }
    this.queue.push(item)
    return id
  }

  async dequeue(): Promise<QueueItem<T> | undefined> {
    if (this.processing.size >= this.maxConcurrent) {
      return undefined
    }

    const item = this.queue.shift()
    if (item) {
      item.status = 'processing'
      item.startedAt = Date.now()
      this.processing.set(item.id, item)
    }
    return item
  }

  async complete(id: string): Promise<void> {
    const item = this.processing.get(id)
    if (item) {
      item.status = 'completed'
      item.completedAt = Date.now()
      this.processing.delete(id)
    }
  }

  async fail(id: string, error: string): Promise<void> {
    const item = this.processing.get(id)
    if (item) {
      item.status = 'failed'
      item.error = error
      item.completedAt = Date.now()
      this.processing.delete(id)
    }
  }
}
