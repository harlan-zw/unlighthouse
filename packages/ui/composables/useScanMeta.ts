import type { ScanMeta } from '@unlighthouse/contracts'
import { useApiClient } from './useApiClient'

export function useScanMeta() {
  const scanMeta = useState<ScanMeta | null>('unlighthouse:scan-meta', () => null)

  async function refresh() {
    const client = useApiClient()
    const data = await client['scan.meta']({}).catch(() => null)
    if (data)
      scanMeta.value = data as unknown as ScanMeta
  }

  function set(meta: ScanMeta) {
    scanMeta.value = meta
  }

  return { scanMeta, refresh, set }
}
