export interface UiStaticTerminalLine {
  /** The command without the shell prompt. */
  command: string
  /** Show a shell prompt. Set false for source code or configuration. */
  prompt?: boolean
  /** A shell comment shown before the command. */
  note?: string
  /** Static output shown after the command. */
  output?: string
  /** Rangi language for the command. */
  language?: string
  /** Rangi language for the output. */
  outputLanguage?: string
}
