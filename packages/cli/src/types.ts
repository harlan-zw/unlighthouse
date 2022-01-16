export interface CliOptions {
  host?: string
  help?: boolean
  site?: string
  cache?: boolean
  noCache?: boolean
  version?: boolean
  root?: string
  configFile?: string
  debug?: boolean
  ['scanner.samples']?: number
}

export interface CiOptions extends CliOptions {
  budget: number
  buildStatic: boolean
}
