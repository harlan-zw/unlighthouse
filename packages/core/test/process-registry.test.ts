import type { LighthouseProcessRegistry } from '../src/process-registry'
import { EventEmitter } from 'node:events'
import { createConsola } from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createLighthouseProcessRegistry,

} from '../src/process-registry'

// Mock child process
class MockChildProcess extends EventEmitter {
  pid: number
  killed = false
  exitCode: number | null = null

  constructor(pid: number) {
    super()
    this.pid = pid
  }

  kill(signal?: string): boolean {
    this.killed = true
    this.exitCode = signal === 'SIGKILL' ? 137 : 0
    // Simulate async process exit
    setTimeout(() => {
      this.emit('exit', this.exitCode)
    }, 10)
    return true
  }
}

describe('lighthouse process registry', () => {
  let logger: any
  let registry: LighthouseProcessRegistry
  let mockProcess1: MockChildProcess
  let mockProcess2: MockChildProcess

  beforeEach(() => {
    // Reset global state
    globalThis.__lighthouse_process_registry__ = undefined
    globalThis.__lighthouse_cleanup_handlers_registered__ = undefined

    // Create mock logger
    logger = createConsola({ level: 0 }) // Silent for tests
    logger.info = vi.fn()
    logger.warn = vi.fn()
    logger.error = vi.fn()
    logger.success = vi.fn()
    logger.debug = vi.fn()

    // Create registry
    registry = createLighthouseProcessRegistry(logger)

    // Create mock processes
    mockProcess1 = new MockChildProcess(1234)
    mockProcess2 = new MockChildProcess(5678)
  })

  afterEach(() => {
    // Clean up any lingering processes
    if (registry) {
      registry.cleanup()
    }
  })

  describe('process registration', () => {
    it('should register a process successfully', () => {
      registry.register(mockProcess1 as any, '/test-route', 0)

      const activeProcesses = registry.getActiveProcesses()
      expect(activeProcesses).toHaveLength(1)
      expect(activeProcesses[0]).toMatchObject({
        pid: 1234,
        route: '/test-route',
        sampleIndex: 0,
        process: mockProcess1,
      })
      expect(activeProcesses[0].startTime).toBeTypeOf('number')
    })

    it('should not register process without pid', () => {
      const processWithoutPid = { ...mockProcess1, pid: undefined }
      registry.register(processWithoutPid as any, '/test-route', 0)

      const activeProcesses = registry.getActiveProcesses()
      expect(activeProcesses).toHaveLength(0)
    })

    it('should register multiple processes', () => {
      registry.register(mockProcess1 as any, '/route-1', 0)
      registry.register(mockProcess2 as any, '/route-2', 1)

      const activeProcesses = registry.getActiveProcesses()
      expect(activeProcesses).toHaveLength(2)
    })

    it('should auto-unregister process on exit', async () => {
      registry.register(mockProcess1 as any, '/test-route', 0)
      expect(registry.getActiveProcesses()).toHaveLength(1)

      // Simulate process exit
      mockProcess1.emit('exit', 0)

      // Wait for async cleanup
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(registry.getActiveProcesses()).toHaveLength(0)
    })

    it('should handle process errors', async () => {
      registry.register(mockProcess1 as any, '/test-route', 0)

      // Simulate process error
      const error = new Error('Process crashed')
      mockProcess1.emit('error', error)

      // Wait for async cleanup
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(logger.error).toHaveBeenCalledWith('Lighthouse process 1234 error:', error)
      expect(registry.getActiveProcesses()).toHaveLength(0)
    })
  })

  describe('process queries', () => {
    beforeEach(() => {
      registry.register(mockProcess1 as any, '/route-1', 0)
      registry.register(mockProcess2 as any, '/route-1', 1)
    })

    it('should get processes by route', () => {
      const processes = registry.getProcessByRoute('/route-1')
      expect(processes).toHaveLength(2)
      expect(processes.map(p => p.pid)).toEqual([1234, 5678])
    })

    it('should return empty array for non-existent route', () => {
      const processes = registry.getProcessByRoute('/non-existent')
      expect(processes).toHaveLength(0)
    })

    it('should get processes sorted by duration', async () => {
      // Wait a bit to create duration difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const processesNow = new MockChildProcess(9999)
      registry.register(processesNow as any, '/route-3', 0)

      const processesByDuration = registry.getProcessesByDuration()
      expect(processesByDuration).toHaveLength(3)
      // Newest process should be last (shortest duration)
      expect(processesByDuration[processesByDuration.length - 1].pid).toBe(9999)
    })
  })

  describe('statistics tracking', () => {
    it('should track basic stats', () => {
      registry.register(mockProcess1 as any, '/route-1', 0)
      registry.register(mockProcess2 as any, '/route-2', 0)

      const stats = registry.getStats()
      expect(stats.activeProcesses).toBe(2)
      expect(stats.totalProcesses).toBe(2)
      expect(stats.completedProcesses).toBe(0)
      expect(stats.failedProcesses).toBe(0)
    })

    it('should update stats on process completion', async () => {
      registry.register(mockProcess1 as any, '/route-1', 0)

      // Wait a bit to ensure some duration
      await new Promise(resolve => setTimeout(resolve, 5))

      // Wait for the exit event to be processed
      const exitPromise = new Promise<void>((resolve) => {
        mockProcess1.once('exit', () => {
          // Give the event handlers time to run
          setTimeout(resolve, 10)
        })
      })

      // Simulate successful completion
      mockProcess1.emit('exit', 0)
      await exitPromise

      const stats = registry.getStats()
      expect(stats.activeProcesses).toBe(0)
      expect(stats.completedProcesses).toBe(1)
      expect(stats.failedProcesses).toBe(0)
      expect(stats.avgDuration).toBeGreaterThanOrEqual(0) // Allow 0 duration for fast tests
    })

    it('should update stats on process failure', async () => {
      registry.register(mockProcess1 as any, '/route-1', 0)

      // Simulate failure
      mockProcess1.emit('exit', 1)
      await new Promise(resolve => setTimeout(resolve, 20))

      const stats = registry.getStats()
      expect(stats.failedProcesses).toBe(1)
      expect(stats.completedProcesses).toBe(0)
    })
  })

  describe('stuck process detection', () => {
    it('should detect stuck processes', () => {
      // Create a process that started 10 minutes ago
      const oldStartTime = Date.now() - (10 * 60 * 1000)
      registry.register(mockProcess1 as any, '/stuck-route', 0)

      // Manually adjust start time for testing
      const processes = registry.getActiveProcesses()
      if (processes[0]) {
        (processes[0] as any).startTime = oldStartTime
      }

      const stuckProcesses = registry.getStuckProcesses(5 * 60 * 1000) // 5 min threshold
      expect(stuckProcesses).toHaveLength(1)
      expect(stuckProcesses[0].pid).toBe(1234)
    })

    it('should not detect recent processes as stuck', () => {
      registry.register(mockProcess1 as any, '/recent-route', 0)

      const stuckProcesses = registry.getStuckProcesses(5 * 60 * 1000)
      expect(stuckProcesses).toHaveLength(0)
    })

    it('should kill stuck processes', async () => {
      // Create stuck process
      const oldStartTime = Date.now() - (10 * 60 * 1000)
      registry.register(mockProcess1 as any, '/stuck-route', 0)

      const processes = registry.getActiveProcesses()
      if (processes[0]) {
        (processes[0] as any).startTime = oldStartTime
      }

      const killedCount = await registry.killStuckProcesses(5 * 60 * 1000)
      expect(killedCount).toBe(1)
      expect(logger.warn).toHaveBeenCalledWith('Found 1 stuck lighthouse processes')
    })
  })

  describe('cleanup functionality', () => {
    it('should cleanup all active processes', async () => {
      registry.register(mockProcess1 as any, '/route-1', 0)
      registry.register(mockProcess2 as any, '/route-2', 0)

      expect(registry.getActiveProcesses()).toHaveLength(2)

      await registry.cleanup(1000) // Short timeout for tests

      expect(registry.getActiveProcesses()).toHaveLength(0)
      // No longer logging info/success messages during cleanup
    })

    it('should handle cleanup with no active processes', async () => {
      await registry.cleanup()
      // Should not throw or log unnecessary messages
      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('global state management', () => {
    it('should create independent registry instances', () => {
      const registry1 = createLighthouseProcessRegistry(logger)
      const registry2 = createLighthouseProcessRegistry(logger)

      // They should be different instances since we're not using the global helper
      expect(registry1).not.toBe(registry2)
    })
  })
})

describe('structured message parsing', () => {
  it('should parse lighthouse structured messages', () => {
    // This would be tested in the lighthouse task tests, but we can test the pattern
    const mockOutput = `
Some regular output
__LIGHTHOUSE_MESSAGE__{"type":"info","route":"/test","message":"Starting audit"}__END_MESSAGE__
More output
__LIGHTHOUSE_MESSAGE__{"type":"success","route":"/test","message":"Completed","data":{"score":0.85}}__END_MESSAGE__
Final output
    `.trim()

    // Since parseStructuredOutput is not exported, we test the integration
    // through the lighthouse task, but here we verify the message format
    const messageRegex = /__LIGHTHOUSE_MESSAGE__(.+?)__END_MESSAGE__/
    const matches = mockOutput.match(messageRegex)

    expect(matches).toBeTruthy()
    if (matches) {
      const message = JSON.parse(matches[1])
      expect(message).toMatchObject({
        type: 'info',
        route: '/test',
        message: 'Starting audit',
      })
    }
  })
})
