// Median-run selection for multi-sample audits.
//
// When `scanner.samples > 1` we audit a URL N times to smooth run-to-run
// variance. We then pick ONE representative run rather than averaging: an
// averaged report would be a Frankenstein (its LHR, reconciled report, metrics
// and screenshot would come from different runs and disagree). Selecting a
// whole run keeps every persisted artifact internally consistent, matching
// lighthouse-ci's median-run approach.

/**
 * Return the median run from `runs`, ranked by `scoreOf(run)`.
 *
 * Runs with a numeric score are sorted ascending and the lower-median is chosen
 * (deterministic on even counts, and never optimistic — it won't pick the
 * better of the two middle runs). Runs whose score is `null` are ignored for
 * ranking; if no run has a numeric score, the first run is returned. Throws
 * only when given an empty list.
 */
export function computeMedianRun<T>(runs: T[], scoreOf: (run: T) => number | null): T {
  if (runs.length === 0)
    throw new Error('computeMedianRun: no runs provided')
  if (runs.length === 1)
    return runs[0]!

  const scored = runs
    .map((run, index) => ({ score: scoreOf(run), index }))
    .filter((x): x is { score: number, index: number } => typeof x.score === 'number')

  if (scored.length === 0)
    return runs[0]!

  scored.sort((a, b) => a.score - b.score || a.index - b.index)
  const mid = Math.floor((scored.length - 1) / 2)
  return runs[scored[mid]!.index]!
}
