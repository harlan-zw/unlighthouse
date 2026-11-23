import { useState } from 'react'
import type { Scan } from '../types.ts'
import { isActive } from './components/controls.tsx'
import { useClient } from './hooks.ts'
import { navigate, routeHref } from './router.tsx'
import { startInputFrom } from './start-input.ts'

export function useRestart(scan: Scan | undefined): { restart: () => Promise<void>, busy: boolean, error: string | null } {
  const client = useClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const restart = async () => {
    if (!scan || busy)
      return
    setBusy(true)
    setError(null)
    try {
      if (isActive(scan.status))
        await client.call('scans.cancel', { scanId: scan.id })
      const next = await client.call('scans.start', startInputFrom(scan))
      navigate(routeHref({ name: 'scan', scanId: next.id }))
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setBusy(false)
    }
  }
  return { restart, busy, error }
}
