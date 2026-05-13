import type { UnlighthouseOptions } from '@unlighthouse/contracts'

export const THROTTLING = {
  mobile: {
    rttMs: 150,
    throughputKbps: 1.6 * 1024,
    requestLatencyMs: 150 * 4,
    downloadThroughputKbps: 1.6 * 1024,
    uploadThroughputKbps: 750,
    cpuSlowdownMultiplier: 1,
  },
  desktop: {
    rttMs: 40,
    throughputKbps: 10 * 1024,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
  none: {
    rttMs: 0,
    throughputKbps: 0,
    cpuSlowdownMultiplier: 1,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
}

export const SCREEN_EMULATION = {
  mobile: {
    mobile: true,
    width: 412,
    height: 823,
    deviceScaleFactor: 1.75,
    disabled: false,
  },
  desktop: {
    mobile: false,
    width: 1350,
    height: 940,
    deviceScaleFactor: 1,
    disabled: false,
  },
}

export const USER_AGENTS = {
  mobile: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
}

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
  return {
    extends: 'lighthouse:default',
    settings: {
      formFactor,
      screenEmulation: getScreenEmulation(formFactor),
      emulatedUserAgent: getUserAgent(formFactor),
      throttling: getThrottling(formFactor),
    },
  }
}
