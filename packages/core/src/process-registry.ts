import type { ConsolaInstance } from 'consola'
import type { ChildProcess } from 'node:child_process'
import { useLogger } from './logger'

export interface LighthouseProcessInfo {
  pid: number
  process: ChildProcess
  route: string
  sampleIndex: number
  startTime: number
}

export interface ProcessRegistryStats {
  totalProcesses: number
  activeProcesses: number
  completedProcesses: number
  failedProcesses: number
  avgDuration: number
}

export interface LighthouseProcessRegistry {
  register: (process: ChildProcess, route: string, sampleIndex: number) => void
  unregister: (pid: number) => void
  getActiveProcesses: () => LighthouseProcessInfo[]
  getProcessByRoute: (route: string) => LighthouseProcessInfo[]
  getStats: () => ProcessRegistryStats
  cleanup: (timeout?: number) => Promise<void>
  getProcessesByDuration: () => LighthouseProcessInfo[]
  getStuckProcesses: (thresholdMs?: number) => LighthouseProcessInfo[]
  killStuckProcesses: (thresholdMs?: number) => Promise<number>
}

export function createLighthouseProcessRegistry(logger: ConsolaInstance): LighthouseProcessRegistry {
  const processes = new Map<number, LighthouseProcessInfo>()
  let isShuttingDown = false
  let completedCount = 0
  let failedCount = 0
  const totalDurations: number[] = []

  function isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    }
    catch (error: any) {
      return error.code !== 'ESRCH'
    }
  }

  async function waitForProcessExit(pid: number, timeout: number): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      if (!isProcessRunning(pid)) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return false
  }

  async function terminateProcess(processInfo: LighthouseProcessInfo, _timeout: number): Promise<boolean> {
    const { pid, process: childProcess, route } = processInfo

    if (childProcess.killed) {
      return true
    }

    try {
      // Step 1: Try SIGTERM (graceful shutdown)
      childProcess.kill('SIGTERM')

      // Wait for graceful termination
      const gracefullyTerminated = await waitForProcessExit(pid, 3000)
      if (gracefullyTerminated) {
        return true
      }

      // Step 2: Force kill with SIGKILL
      childProcess.kill('SIGKILL')

      const forceTerminated = await waitForProcessExit(pid, 2000)
      if (forceTerminated) {
        return true
      }

      logger.warn(`  ⚠️  Lighthouse process ${pid} may still be running`)
      return false
    }
    catch (error: any) {
      // ESRCH means process doesn't exist (good)
      if (error.code === 'ESRCH') {
        return true
      }
      throw error
    }
  }

  const registry: LighthouseProcessRegistry = {
    register(process: ChildProcess, route: string, sampleIndex: number): void {
      if (!process.pid || isShuttingDown) {
        return
      }

      const processInfo: LighthouseProcessInfo = {
        pid: process.pid,
        process,
        route,
        sampleIndex,
        startTime: Date.now(),
      }

      processes.set(process.pid, processInfo)

      // Auto-cleanup when process exits naturally
      process.on('exit', (code) => {
        const info = processes.get(process.pid!)
        if (info) {
          const duration = Date.now() - info.startTime
          totalDurations.push(duration)

          if (code === 0) {
            completedCount++
          }
          else {
            failedCount++
          }

          registry.unregister(process.pid!)
        }
      })

      // Handle process errors
      process.on('error', (error) => {
        logger.error(`Lighthouse process ${process.pid} error:`, error)
        failedCount++
        registry.unregister(process.pid!)
      })
    },

    unregister(pid: number): void {
      processes.delete(pid)
    },

    getActiveProcesses(): LighthouseProcessInfo[] {
      return Array.from(processes.values())
    },

    getProcessByRoute(route: string): LighthouseProcessInfo[] {
      return Array.from(processes.values()).filter(p => p.route === route)
    },

    getStats(): ProcessRegistryStats {
      const activeProcesses = processes.size
      const totalProcesses = activeProcesses + completedCount + failedCount
      const avgDuration = totalDurations.length > 0
        ? totalDurations.reduce((a, b) => a + b, 0) / totalDurations.length
        : 0

      return {
        totalProcesses,
        activeProcesses,
        completedProcesses: completedCount,
        failedProcesses: failedCount,
        avgDuration,
      }
    },

    async cleanup(timeout = 10000): Promise<void> {
      isShuttingDown = true

      const activeProcesses = registry.getActiveProcesses()
      if (activeProcesses.length === 0) {
        return
      }

      // Attempt graceful shutdown first
      const terminationPromises = activeProcesses.map(async (processInfo) => {
        try {
          return await terminateProcess(processInfo, timeout)
        }
        catch (error) {
          logger.error(`Failed to terminate lighthouse process ${processInfo.pid} (${processInfo.route}):`, error)
          return false
        }
      })

      const results = await Promise.allSettled(terminationPromises)

      const successful = results.filter(r => r.status === 'fulfilled' && r.value).length
      const failed = results.length - successful

      if (failed > 0) {
        logger.warn(`${failed} lighthouse processes could not be terminated gracefully`)
      }

      // Clear the registry
      processes.clear()
    },

    getProcessesByDuration(): LighthouseProcessInfo[] {
      const now = Date.now()
      return registry.getActiveProcesses()
        .map(p => ({ ...p, duration: now - p.startTime }))
        .sort((a, b) => b.duration - a.duration)
    },

    getStuckProcesses(thresholdMs = 5 * 60 * 1000): LighthouseProcessInfo[] {
      const now = Date.now()
      return registry.getActiveProcesses().filter(p => now - p.startTime > thresholdMs)
    },

    async killStuckProcesses(thresholdMs = 5 * 60 * 1000): Promise<number> {
      const stuckProcesses = registry.getStuckProcesses(thresholdMs)

      if (stuckProcesses.length === 0) {
        return 0
      }

      logger.warn(`Found ${stuckProcesses.length} stuck lighthouse processes`)

      for (const processInfo of stuckProcesses) {
        try {
          await terminateProcess(processInfo, 3000)
          failedCount++
        }
        catch (error) {
          logger.error(`Failed to kill stuck process ${processInfo.pid}:`, error)
        }
      }

      return stuckProcesses.length
    },
  }

  return registry
}

// Global state management using globalThis
declare global {
  // eslint-disable-next-line vars-on-top
  var __lighthouse_process_registry__: LighthouseProcessRegistry | undefined
  // eslint-disable-next-line vars-on-top
  var __lighthouse_cleanup_handlers_registered__: boolean | undefined
}

function getRegistry(): LighthouseProcessRegistry {
  if (!globalThis.__lighthouse_process_registry__) {
    const logger = useLogger()
    globalThis.__lighthouse_process_registry__ = createLighthouseProcessRegistry(logger)
  }
  return globalThis.__lighthouse_process_registry__
}

// Helper function to register a lighthouse process
export function registerLighthouseProcess(
  process: ChildProcess,
  route: string,
  sampleIndex: number,
): void {
  getRegistry().register(process, route, sampleIndex)
}

// Helper to get process stats
export function getLighthouseProcessStats(): ProcessRegistryStats {
  return getRegistry().getStats()
}

// Setup cleanup handlers
export function setupProcessCleanup(): void {
  if (globalThis.__lighthouse_cleanup_handlers_registered__) {
    return
  }

  const logger = useLogger()

  const cleanup = async (signal: string) => {
    await getRegistry().cleanup()
    process.exit(0)
  }

  process.on('SIGINT', () => cleanup('SIGINT'))
  process.on('SIGTERM', () => cleanup('SIGTERM'))
  process.on('beforeExit', () => cleanup('beforeExit'))

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception:', error)
    await getRegistry().cleanup(5000) // Shorter timeout for emergencies
    process.exit(1)
  })

  globalThis.__lighthouse_cleanup_handlers_registered__ = true
}
