export interface LimiterStats {
  active: number
  queued: number
  max: number
}

export interface Limiter {
  run: <T>(work: () => Promise<T>) => Promise<T>
  getStats: () => LimiterStats
  setMax: (max: number) => void
}

export function createLimiter(initialMax: number): Limiter {
  let active = 0
  let max = initialMax
  const waiters: Array<() => void> = []

  const drain = () => {
    while (active < max && waiters.length > 0) {
      const next = waiters.shift()!
      active++
      next()
    }
  }

  const acquire = (): Promise<void> => {
    if (active < max) {
      active++
      return Promise.resolve()
    }
    return new Promise<void>(resolve => waiters.push(resolve))
  }

  const release = () => {
    active--
    drain()
  }

  return {
    async run(work) {
      await acquire()
      try {
        return await work()
      }
      finally {
        release()
      }
    },
    getStats() {
      return { active, queued: waiters.length, max }
    },
    setMax(newMax) {
      max = newMax
      drain()
    },
  }
}
