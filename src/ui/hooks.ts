import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { UnlighthouseEvent } from '../events.ts'
import type { Client, ConnectionState, Input, Operation, Output } from './api.ts'

export const ClientContext = createContext<Client | null>(null)

export function useClient(): Client {
  const client = useContext(ClientContext)
  if (!client)
    throw new Error('ClientContext is missing')
  return client
}

export interface Query<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
  reload: () => void
}

export function useQuery<K extends Operation>(operation: K, input: Input<K> | null, refresh = 0): Query<Output<K>> {
  const client = useClient()
  const key = input === null ? null : `${operation}:${JSON.stringify(input)}`
  const [state, setState] = useState<{ key: string | null, data: Output<K> | undefined, error: Error | null, loading: boolean }>({ key: null, data: undefined, error: null, loading: input !== null })
  const [nonce, setNonce] = useState(0)
  const inputRef = useRef(input)
  inputRef.current = input

  useEffect(() => {
    const current = inputRef.current
    if (key === null || current === null)
      return
    let cancelled = false
    setState(prev => ({ ...prev, loading: true, error: null }))
    client.call(operation, current).then(
      (data) => {
        if (!cancelled)
          setState({ key, data, error: null, loading: false })
      },
      (error: unknown) => {
        if (!cancelled)
          setState(prev => ({ ...prev, key, error: error instanceof Error ? error : new Error(String(error)), loading: false }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [client, operation, key, nonce, refresh])

  const reload = useCallback(() => setNonce(n => n + 1), [])
  return { data: state.data, error: state.error, loading: state.loading, reload }
}

export function useScanEvents(scanId: string | null, listener: (event: UnlighthouseEvent) => void): void {
  const client = useClient()
  const ref = useRef(listener)
  ref.current = listener
  useEffect(() => {
    if (!scanId)
      return
    return client.subscribe(scanId, event => ref.current(event))
  }, [client, scanId])
}

export function useConnection(): ConnectionState {
  const client = useClient()
  const [state, setState] = useState<ConnectionState>('closed')
  useEffect(() => client.onConnection(setState), [client])
  return state
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Unlighthouse` : 'Unlighthouse'
  }, [title])
}
