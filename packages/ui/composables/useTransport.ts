// Connection-status reader. Wiring (open/close listeners, reconnect) lives in
// `plugins/transport.client.ts`; ingest listeners live in
// `plugins/live-reports.client.ts` and `plugins/scan.client.ts`. Components
// that just need a status flag use `useIsOffline()`.

import type { TransportConnection } from '~/plugins/transport.client'

export function useTransport() {
  const transport = useNuxtApp().$transport as TransportConnection
  const isOffline = useState<boolean>('unlighthouse:offline', () => false)
  return {
    isOpen: transport.isOpen,
    isOffline,
  }
}

export function useIsOffline() {
  return useState<boolean>('unlighthouse:offline', () => false)
}
