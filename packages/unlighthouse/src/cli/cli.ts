import type { Command } from '@unlighthouse/contracts/commands'
import { runMain } from 'citty'
import { version } from '../../package.json'
import { emitError, exitCodeForError, isAgentMode, stampSchema, writeNdjson } from './agent-mode'
import { buildCli } from './createCli'

export interface CliEntryOptions {
  argv?: string[]
  env?: NodeJS.ProcessEnv
}

// Subcommands point storage at the same --site/--root the scan ran under.
function argFromArgv(argv: string[], name: string): string | undefined {
  const flag = `--${name}`
  const idx = argv.indexOf(flag)
  const next = idx !== -1 ? argv[idx + 1] : undefined
  if (next && !next.startsWith('-'))
    return next
  const eq = argv.find(a => a.startsWith(`${flag}=`))
  return eq ? eq.slice(flag.length + 1) : undefined
}

/** Build the CLI command without parsing arguments or touching process lifecycle. */
export function createCliCommand(options: CliEntryOptions = {}) {
  const argv = options.argv ?? process.argv.slice(2)
  const env = options.env ?? process.env
  const agent = isAgentMode(argv)

  async function emit(cmd: Command, result: unknown): Promise<void> {
    if (agent) {
      writeNdjson(stampSchema(cmd.name, result))
      return
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }

  function onError(cmd: Command, err: unknown): never {
    emitError(err, agent, env)
    process.exit(exitCodeForError(err, cmd))
  }

  // Projected subcommands are one-shot; the ctx holds a DB handle that keeps
  // the loop alive, so flush stdout and exit once the command has emitted.
  async function onComplete(): Promise<void> {
    await new Promise<void>(resolve => process.stdout.write('', () => resolve()))
    process.exit(0)
  }

  return buildCli({
    version,
    argv,
    runRoot: async (rootOptions) => {
      const { runCliRoot } = await import('./root-runtime')
      await runCliRoot(rootOptions, { argv, env })
    },
    projection: {
      handlers: async () => {
        const { createHandlers } = await import('@unlighthouse/core/api/handlers')
        return createHandlers()
      },
      createCtx: async () => {
        const { buildCliContext } = await import('./ctx')
        return buildCliContext({
          site: argFromArgv(argv, 'site'),
          root: argFromArgv(argv, 'root'),
          debug: argv.includes('--debug') || argv.includes('-d'),
          env,
        })
      },
      emit,
      onError,
      onComplete,
    },
  })
}

/** Run the executable CLI entrypoint. Importing this module does not run it. */
export async function runCli(options: CliEntryOptions = {}): Promise<void> {
  const argv = options.argv ?? process.argv.slice(2)
  await runMain(createCliCommand({ ...options, argv }), { rawArgs: argv })
}
