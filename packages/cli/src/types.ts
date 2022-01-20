export interface CliOptions {
  host?: string
  help?: boolean
  site?: string
  throttle?: boolean
  cache?: boolean
  noCache?: boolean
  version?: boolean
  root?: string
  configFile?: string
  debug?: boolean
  samples?: number
  enableJavascript?: boolean
  disableJavascript?: boolean
}

export interface CiOptions extends CliOptions {
  budget: number
  buildStatic: boolean
}
