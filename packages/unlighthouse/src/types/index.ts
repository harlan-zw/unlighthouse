import type { Config, Flags, Result } from 'lighthouse'

export interface UnlighthouseOptions {
  /**
   * Provider to use for scanning.
   */
  provider?: UnlighthouseProvider
  /**
   * Lighthouse config to use.
   */
  lighthouseConfig?: Config
  /**
   * Lighthouse flags to use.
   */
  lighthouseFlags?: Flags
  /**
   * Port to connect to.
   */
  port?: number
  /**
   * Log level.
   */
  logLevel?: 'info' | 'error' | 'silent' | 'verbose'
  /**
   * Default emulated form factor.
   */
  emulatedFormFactor?: 'mobile' | 'desktop'
  /**
   * Dimensions for the viewport.
   */
  width?: number
  height?: number
  /**
   * Chrome launcher options.
   */
  launchOptions?: any
}

export type UnlighthouseProvider = (url: string, options?: UnlighthouseOptions) => Promise<UnlighthouseReport>

export interface UnlighthouseContext {
  options: UnlighthouseOptions
}

export interface UnlighthouseInsights {
  score: number
  categories: Record<string, {
    id: string
    title: string
    score: number
  }>
  coreWebVitals: {
    lcp: number
    cls: number
    fcp: number
    tbt: number
    si: number
  }
}

export interface UnlighthouseReport {
  url: string
  fetchTime: string
  insights: UnlighthouseInsights
  artifacts?: any
  raw?: Result
}

export interface UnlighthouseHooks {
  'report:ready': (report: UnlighthouseReport) => void | Promise<void>
}
