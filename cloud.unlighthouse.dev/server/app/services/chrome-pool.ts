import type { LaunchedChrome } from 'chrome-launcher'
import chromeLauncher from 'chrome-launcher'
import { useRuntimeConfig } from '#imports'

export interface ChromeInstance {
  chrome: LaunchedChrome
  inUse: boolean
  lastUsed: number
  id: string
}

export interface ChromePoolOptions {
  minInstances?: number
  maxInstances?: number
  idleTimeout?: number
  chromeFlags?: string[]
}

/**
 * Chrome instance pool for reusing browser instances across multiple Lighthouse scans.
 * This significantly reduces overhead and improves throughput while maintaining accuracy.
 */
export class ChromePool {
  private instances: Map<string, ChromeInstance> = new Map()
  private options: Required<ChromePoolOptions>
  private cleanupInterval?: NodeJS.Timeout
  private nextId = 0

  constructor(options: ChromePoolOptions = {}) {
    this.options = {
      minInstances: options.minInstances ?? 1,
      maxInstances: options.maxInstances ?? 5,
      idleTimeout: options.idleTimeout ?? 5 * 60 * 1000, // 5 minutes
      chromeFlags: options.chromeFlags ?? ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    }

    // Start cleanup interval to remove idle instances
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60_000) // Check every minute
  }

  /**
   * Initialize the pool with minimum instances
   */
  async initialize(): Promise<void> {
    const promises = []
    for (let i = 0; i < this.options.minInstances; i++) {
      promises.push(this.createInstance())
    }
    await Promise.all(promises)
  }

  /**
   * Get an available Chrome instance or create a new one
   */
  async acquire(): Promise<ChromeInstance> {
    // Try to find an available instance
    for (const instance of this.instances.values()) {
      if (!instance.inUse) {
        instance.inUse = true
        instance.lastUsed = Date.now()
        return instance
      }
    }

    // If all instances are in use and we haven't hit max, create a new one
    if (this.instances.size < this.options.maxInstances) {
      const instance = await this.createInstance()
      instance.inUse = true
      instance.lastUsed = Date.now()
      return instance
    }

    // Wait for an instance to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const instance of this.instances.values()) {
          if (!instance.inUse) {
            clearInterval(checkInterval)
            instance.inUse = true
            instance.lastUsed = Date.now()
            resolve(instance)
            return
          }
        }
      }, 100)
    })
  }

  /**
   * Release a Chrome instance back to the pool
   */
  release(instance: ChromeInstance): void {
    const poolInstance = this.instances.get(instance.id)
    if (poolInstance) {
      poolInstance.inUse = false
      poolInstance.lastUsed = Date.now()
    }
  }

  /**
   * Create a new Chrome instance
   */
  private async createInstance(): Promise<ChromeInstance> {
    const id = `chrome-${this.nextId++}`

    const chrome = await chromeLauncher.launch({
      chromeFlags: this.options.chromeFlags,
    })

    const instance: ChromeInstance = {
      chrome,
      inUse: false,
      lastUsed: Date.now(),
      id,
    }

    this.instances.set(id, instance)
    return instance
  }

  /**
   * Clean up idle instances (keeping minimum pool size)
   */
  private async cleanup(): Promise<void> {
    const now = Date.now()
    const instancesToRemove: string[] = []

    for (const [id, instance] of this.instances.entries()) {
      if (
        !instance.inUse
        && this.instances.size > this.options.minInstances
        && now - instance.lastUsed > this.options.idleTimeout
      ) {
        instancesToRemove.push(id)
      }
    }

    for (const id of instancesToRemove) {
      const instance = this.instances.get(id)
      if (instance) {
        try {
          await instance.chrome.kill()
        }
        catch (e) {
          console.error(`Failed to kill Chrome instance ${id}:`, e)
        }
        this.instances.delete(id)
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const instances = Array.from(this.instances.values())
    return {
      total: instances.length,
      available: instances.filter(i => !i.inUse).length,
      inUse: instances.filter(i => i.inUse).length,
      minInstances: this.options.minInstances,
      maxInstances: this.options.maxInstances,
    }
  }

  /**
   * Shutdown the pool and kill all instances
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    const promises = Array.from(this.instances.values()).map(async (instance) => {
      try {
        await instance.chrome.kill()
      }
      catch (e) {
        console.error(`Failed to kill Chrome instance ${instance.id}:`, e)
      }
    })

    await Promise.all(promises)
    this.instances.clear()
  }
}

// Singleton instance
let chromePool: ChromePool | null = null

export function getChromePool(): ChromePool {
  if (!chromePool) {
    const config = useRuntimeConfig()
    chromePool = new ChromePool({
      minInstances: config.lighthouse?.minChromeInstances || 1,
      maxInstances: config.lighthouse?.maxChromeInstances || 5,
      idleTimeout: config.lighthouse?.chromeIdleTimeout || 5 * 60 * 1000,
    })
  }
  return chromePool
}

export async function initializeChromePool(): Promise<void> {
  const pool = getChromePool()
  await pool.initialize()
}

export async function shutdownChromePool(): Promise<void> {
  if (chromePool) {
    await chromePool.shutdown()
    chromePool = null
  }
}
