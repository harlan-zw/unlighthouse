import { SCREEN_EMULATION, THROTTLING, USER_AGENTS } from './constants'
import type { UnlighthouseOptions } from '../types'

export function getScreenEmulation(formFactor: 'mobile' | 'desktop') {
  return SCREEN_EMULATION[formFactor]
}

export function getUserAgent(formFactor: 'mobile' | 'desktop') {
  return USER_AGENTS[formFactor]
}

export function getThrottling(formFactor: 'mobile' | 'desktop') {
  return THROTTLING[formFactor] || THROTTLING.none
}

export function resolveLighthouseConfig(options: UnlighthouseOptions) {
  const formFactor = options.emulatedFormFactor || 'mobile'
  const screenEmulation = getScreenEmulation(formFactor)
  const userAgent = getUserAgent(formFactor)
  
  // TODO: Merge with provided config
  return {
    extends: 'lighthouse:default',
    settings: {
      formFactor,
      screenEmulation,
      emulatedUserAgent: userAgent,
      throttling: getThrottling(formFactor),
    },
  }
}
