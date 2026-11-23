import { useEffect, useState } from 'react'
import { ErrorState, isActive, Skeleton } from '../components/controls.tsx'
import { TopBar } from '../components/layout.tsx'
import { useScope } from '../scope.tsx'
import { IssuesPage } from './Issues.tsx'
import { LiveScanPage } from './LiveScan.tsx'

export function ScanPage() {
  const { scan, error } = useScope()
  const [live, setLive] = useState(false)
  const [left, setLeft] = useState(false)
  const active = scan ? isActive(scan.status) : false
  useEffect(() => {
    if (active)
      setLive(true)
  }, [active])

  if (error && !scan)
    return <ErrorState error={error} />
  if (!scan)
    return <><TopBar crumbs={[{ label: '…' }]} /><div className="pad"><Skeleton lines={6} height={44} /></div></>
  if ((active || live) && !left)
    return <LiveScanPage onLeave={() => setLeft(true)} />
  return <IssuesPage />
}
