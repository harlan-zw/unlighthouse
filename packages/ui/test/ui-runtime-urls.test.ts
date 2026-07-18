import { describe, expect, it } from 'vitest'
import {
  resolveRuntimeApiUrl,
  resolveRuntimeWebsocketUrl,
} from '../app/composables/useRuntimeUrls'

const remoteLocation = {
  host: 'audit.example.com',
  origin: 'https://audit.example.com',
  protocol: 'https:',
}

describe('dashboard runtime URLs', () => {
  it('keeps configured URLs for standalone Nuxt development', () => {
    expect(resolveRuntimeApiUrl('http://localhost:5678/api', undefined, remoteLocation))
      .toBe('http://localhost:5678/api')
    expect(resolveRuntimeWebsocketUrl('ws://localhost:5678/api/ws', undefined, remoteLocation, false))
      .toBe('ws://localhost:5678/api/ws')
  })

  it('rebases embedded host paths onto the browser origin', () => {
    const embedded = {
      apiUrl: 'http://localhost:5678/reports/api',
      websocketUrl: 'ws://localhost:5678/reports/api/ws',
    }

    expect(resolveRuntimeApiUrl('http://localhost:5678/api', embedded, remoteLocation))
      .toBe('https://audit.example.com/reports/api')
    expect(resolveRuntimeWebsocketUrl('ws://localhost:5678/api/ws', embedded, remoteLocation, false))
      .toBe('wss://audit.example.com/reports/api/ws')
  })

  it('disables live sockets for static reports', () => {
    expect(resolveRuntimeWebsocketUrl(
      'ws://localhost:5678/api/ws',
      { websocketUrl: 'ws://localhost:5678/api/ws' },
      remoteLocation,
      true,
    )).toBe('')
  })

  it('falls back to configured URLs when embedded data is malformed', () => {
    expect(resolveRuntimeApiUrl(
      'https://api.example.com/v1',
      { apiUrl: 'http://[' },
      remoteLocation,
    )).toBe('https://api.example.com/v1')
  })
})
