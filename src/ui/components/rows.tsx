import { useState } from 'react'
import type { ScanSummary } from '../../analysis/summary.ts'
import type { Scan, ScanStats, ScanStatus } from '../../types.ts'
import { formatCount, formatWhen } from '../format.ts'
import { useQuery, useScanEvents } from '../hooks.ts'
import { isActive } from './controls.tsx'

export interface ScanFigures {
  status: ScanStatus | undefined
  stats: ScanStats | undefined
  running: boolean
  progress: number
  summary: ScanSummary | undefined
  loading: boolean
}

export function useScanFigures(scan: Scan | null): ScanFigures {
  const [live, setLive] = useState<{ status: ScanStatus, stats: ScanStats } | null>(null)
  useScanEvents(scan && isActive(scan.status) ? scan.id : null, (event) => {
    if (!scan)
      return
    if (event.type === 'scan:progress') {
      const { type: _type, scanId: _id, ...stats } = event
      setLive(prev => ({ status: prev?.status ?? scan.status, stats }))
    }
    else if (event.type === 'scan:status') {
      setLive(prev => ({ status: event.status, stats: prev?.stats ?? scan.stats }))
    }
  })
  const status = live?.status ?? scan?.status
  const stats = live?.stats ?? scan?.stats
  const summary = useQuery('scans.summary', scan && status === 'done' ? { scanId: scan.id } : null)
  const finished = stats ? stats.done + stats.failed : 0
  const total = stats ? finished + stats.queued : 0
  return { status, stats, running: status ? isActive(status) : false, progress: total > 0 ? Math.round((finished / total) * 100) : 0, summary: summary.data, loading: summary.loading || (status === 'done' && !summary.data && !summary.error) }
}

export function FigureCells({ figures, scan }: { figures: ScanFigures, scan: Scan | null }) {
  const { summary, running, progress } = figures
  const baseline = summary?.baseline
  return (
    <>
      <span className="site-row-issues">
        <span className="big num">{summary ? formatCount(summary.issueCount) : figures.loading ? '' : '—'}</span>
        <span className="muted">issues</span>
      </span>
      <span className="site-row-delta num">
        {running
          ? (
              <span className="mini-progress">
                <span className="mini-track"><span className="mini-fill" style={{ width: `${progress}%` }} /></span>
                <span className="accent-text">{`${progress}%`}</span>
              </span>
            )
          : baseline && (
              <>
                {baseline.issues.new > 0 && <span className="c-new">{`+${formatCount(baseline.issues.new)} new`}</span>}
                {baseline.issues.fixed > 0 && <span className="c-fixed">{`${formatCount(baseline.issues.fixed)} fixed`}</span>}
              </>
            )}
      </span>
      <span className="muted site-row-when">{running ? 'scanning' : scan ? formatWhen(scan.createdAt) : '—'}</span>
    </>
  )
}
