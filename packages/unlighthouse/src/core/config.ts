import { ResolvedUserConfig, UserConfig } from '@shared'
import defu from 'defu'
import { hasProtocol, withoutTrailingSlash } from 'ufo'
import { defaultConfig } from './constants'

export const resolveUserConfig: (config: UserConfig) => ResolvedUserConfig = (config) => {

  // apply default config
  config = defu(config, defaultConfig)
  // normalise host
  config.host = withoutTrailingSlash(config.host)
  if (!hasProtocol(config.host))
    config.host = `http${config.host.startsWith('localhost') ? 's' : ''}://${config.host}`
  if (!config.lighthouseOptions)
    config.lighthouseOptions = {}
  // for local urls we disable throttling
  if (config.host.includes('localhost') || !config.scanner?.throttle) {
    config.lighthouseOptions.throttlingMethod = 'provided'
    config.lighthouseOptions.throttling = {
      rttMs: 0,
      throughputKbps: 0,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0, // 0 means unset
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    }
  }
  if (!config.lighthouseOptions.onlyCategories) {
    config.lighthouseOptions.onlyCategories = ['performance', 'accessibility', 'best-practices', 'seo']
  }

  return config as ResolvedUserConfig
}
