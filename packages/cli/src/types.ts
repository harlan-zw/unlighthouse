export interface CliOptions {
  host: string
  help?: boolean
  version?: boolean
  root?: string
  configFile?: string
  debug?: boolean
}

export interface CiOptions extends CliOptions {
  budget: number
  buildStatic: boolean
}
