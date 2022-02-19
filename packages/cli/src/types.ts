export interface CliOptions {
  host?: string
  help?: boolean
  urls?: string
  site?: string
  throttle?: boolean
  cache?: boolean
  noCache?: boolean
  version?: boolean
  root?: string
  configFile?: string
  debug?: boolean
  samples?: number
  enableI18nPages?: boolean
  disableI18nPages?: boolean
  enableJavascript?: boolean
  disableJavascript?: boolean
}

export interface CiOptions extends CliOptions {
  budget: number
  buildStatic: boolean
}
