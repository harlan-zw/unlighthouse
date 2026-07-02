// D-042: a serial lane over the audit pool. Tasks submitted through `run` are
// chained tail-to-head so at most ONE executes at a time, regardless of how
// many worker threads the pool has. Used by the local auditor to serialize
// perf-category audits (which contend for CPU and contaminate TBT/LCP/SI when
// run in parallel) while non-perf categories still dispatch straight to the
// pool and sweep in parallel.
//
// This is the driver-side realization of the "serial perf lane": it gates
// dispatch into the pool rather than living inside tinypool, which keeps the
// pool itself lane-agnostic and the behaviour trivially testable.

export interface SerialLane {
  /**
   * Run `fn` after every previously-submitted lane task settles. At most one
   * lane task runs at a time. A rejection does not wedge the lane — later tasks
   * still run once the failed one settles.
   */
  run: <T>(fn: () => Promise<T>) => Promise<T>
}

export function createSerialLane(): SerialLane {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      const result = tail.then(fn, fn)
      // Advance the tail on settle (success OR failure) so one rejected task
      // never blocks the lane forever.
      tail = result.then(() => undefined, () => undefined)
      return result
    },
  }
}
