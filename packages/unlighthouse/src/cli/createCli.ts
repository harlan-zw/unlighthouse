// D-033: the CLI is the third projection of the command registry (alongside
// HTTP + MCP). The root command keeps the v0 ergonomic entry
// (`unlighthouse --site x.com` = scan + dashboard); every registry command is
// projected as a citty subcommand by `projectCliCommands`.
//
// The root flag surface is byte-compatible with the previous cac program: same
// kebab flags, same effects. Parse differences are isolated to `rootArgsToOptions`
// which reproduces cac's parsed `CliOptions` shape (camelCase keys, numeric
// `samples`, `--no-cache` -> `cache:false`).

import type { ArgsDef, CommandDef } from 'citty'
import type { CliProjectionOptions } from './project'
import type { CliOptions } from './types'
import { defineCommand, parseArgs } from 'citty'
import { projectCliCommands } from './project'

// Root flags — descriptions mirror the previous cac `--help` verbatim so the
// documented surface does not change. Keys are kebab (the CLI flag), mapped to
// camelCase `CliOptions` in `rootArgsToOptions`.
export const ROOT_ARGS: ArgsDef = {
  'root': { type: 'string', description: 'Define the project root. Useful for changing where the config is read from or setting up sampling.' },
  'config-file': { type: 'string', description: 'Path to config file.' },
  'output-path': { type: 'string', description: 'Path to save the contents of the client and reports to.' },
  'cache': { type: 'boolean', description: 'Enable the caching. Use --no-cache to disable.' },
  'desktop': { type: 'boolean', description: 'Simulate device as desktop.' },
  'mobile': { type: 'boolean', description: 'Simulate device as mobile.' },
  'device': { type: 'string', description: 'Devices to audit (comma-separated): `mobile`, `desktop`, or `mobile,desktop`.' },
  'site': { type: 'string', description: 'Host URL to scan.' },
  'host': { type: 'string', description: 'Network host to bind the dashboard server to. Defaults to 127.0.0.1 (loopback). Use --host 0.0.0.0 to expose on the network.' },
  'user-agent': { type: 'string', description: 'Specify a top-level user agent all requests will use.' },
  'router-prefix': { type: 'string', description: 'The URL path prefix for the client and API to run from.' },
  'sitemaps': { type: 'string', description: 'Comma separated list of sitemaps to use for scanning. Providing these will override any in robots.txt.' },
  'samples': { type: 'string', description: 'Specify the amount of samples to run.' },
  'throttle': { type: 'boolean', description: 'Enable the throttling' },
  'enable-javascript': { type: 'boolean', description: 'When inspecting the HTML wait for the javascript to execute. Useful for SPAs.' },
  'disable-javascript': { type: 'boolean', description: 'When inspecting the HTML, don\'t wait for the javascript to execute.' },
  'enable-i18n-pages': { type: 'boolean', description: 'Scan localized (i18n) duplicate pages too, instead of skipping them.' },
  'disable-i18n-pages': { type: 'boolean', description: 'Skip localized duplicates: pages whose x-default alternate link points to a different URL (default).' },
  'urls': { type: 'string', description: 'Specify explicit relative paths to scan as a comma-separated list, disabling the link crawler.' },
  'exclude-urls': { type: 'string', description: 'Relative paths (string or regex) to exclude as a comma-separated list.' },
  'include-urls': { type: 'string', description: 'Relative paths (string or regex) to include as a comma-separated list.' },
  'disable-robots-txt': { type: 'boolean', description: 'Disables the robots.txt crawling.' },
  'disable-sitemap': { type: 'boolean', description: 'Disables the sitemap.xml crawling.' },
  'disable-dynamic-sampling': { type: 'boolean', description: 'Disables the sampling of paths.' },
  'extra-headers': { type: 'string', description: 'Extra headers to send with the request. Example: --extra-headers foo=bar,bar=foo' },
  'cookies': { type: 'string', description: 'Cookies to send with the request. Example: --cookies foo=bar;bar=foo' },
  'auth': { type: 'string', description: 'Basic auth to send with the request. Example: --auth username:password' },
  'default-query-params': { type: 'string', description: 'Default query params to send with the request. Example: --default-query-params foo=bar,bar=foo' },
  'debug': { type: 'boolean', alias: 'd', description: 'Debug. Enable debugging in the logger.' },
  'history': { type: 'boolean', description: 'Start the UI in history-only mode without running a scan.' },
  'assert': { type: 'boolean', description: 'Evaluate CI assertions after scan. Exit with code 1 on failure.' },
}

/**
 * Map citty-parsed root args to the `CliOptions` shape the previous cac program
 * produced (consumed by `pickOptions` / `parseDevices` / `validateOptions`).
 * `rawArgs` disambiguates `cache`: cac only set it when `--cache` / `--no-cache`
 * was passed, otherwise it stayed undefined (caching left to config defaults).
 */
export function rootArgsToOptions(args: Record<string, unknown>, rawArgs: string[]): CliOptions {
  const str = (k: string): string | undefined => (typeof args[k] === 'string' && args[k] !== '' ? args[k] as string : undefined)
  const bool = (k: string): boolean | undefined => (args[k] === true ? true : undefined)

  let cache: boolean | undefined
  if (rawArgs.includes('--no-cache'))
    cache = false
  else if (rawArgs.includes('--cache'))
    cache = true

  const samplesRaw = str('samples')

  const options: CliOptions = {
    root: str('root'),
    configFile: str('config-file'),
    outputPath: str('output-path') as CliOptions['outputPath'],
    cache,
    desktop: bool('desktop'),
    mobile: bool('mobile'),
    device: str('device'),
    site: str('site'),
    host: str('host'),
    userAgent: str('user-agent'),
    routerPrefix: str('router-prefix'),
    sitemaps: str('sitemaps'),
    samples: samplesRaw != null ? Number(samplesRaw) : undefined,
    throttle: bool('throttle'),
    enableJavascript: bool('enable-javascript'),
    disableJavascript: bool('disable-javascript'),
    enableI18nPages: bool('enable-i18n-pages'),
    disableI18nPages: bool('disable-i18n-pages'),
    urls: str('urls'),
    excludeUrls: str('exclude-urls'),
    includeUrls: str('include-urls'),
    disableRobotsTxt: bool('disable-robots-txt'),
    disableSitemap: bool('disable-sitemap'),
    disableDynamicSampling: bool('disable-dynamic-sampling'),
    extraHeaders: str('extra-headers'),
    cookies: str('cookies'),
    auth: str('auth'),
    defaultQueryParams: str('default-query-params'),
    debug: bool('debug'),
    history: bool('history'),
    assert: bool('assert'),
  } as CliOptions
  return options
}

/** Parse a root-command argv into `CliOptions` (citty parse + cac-compatible mapping). Used by the parity test. */
export function parseRootArgs(rawArgs: string[]): CliOptions {
  return rootArgsToOptions(parseArgs(rawArgs, ROOT_ARGS) as Record<string, unknown>, rawArgs)
}

export interface BuildCliDeps {
  version: string
  /** Root command runtime: scan + dashboard (or dashboard-only). Owns the h3 server + lifecycle. */
  runRoot: (options: CliOptions, rawArgs: string[]) => Promise<void>
  /** Registry projection wiring (handlers + per-invocation ctx + output). */
  projection: CliProjectionOptions
  /** Raw argv (without node/script). Defaults to `process.argv.slice(2)`. */
  argv?: string[]
}

/** Long/short flag key from a raw token: `--site` → `site`, `--device=x` → `device`, `-d` → `d`. */
function flagKey(token: string): string {
  return token.replace(/^--?/, '').split('=')[0] ?? ''
}

/**
 * Whether this invocation is subcommand-shaped. citty (0.1.6) resolves a
 * subcommand from the FIRST non-dash token in rawArgs without accounting for
 * flag values, so `unlighthouse --site example.com` would read `example.com`
 * (the `--site` value) as a command name and die with "Unknown command".
 *
 * We walk the args value-aware: a string/number flag consumes the following
 * token, so it is not a positional. The first token that is neither a flag nor
 * a consumed flag-value is a real positional — a subcommand. Attach subCommands
 * then (the canonical `unlighthouse scan start ...`, and pure-flag `--help` /
 * `--version` which have no positional so still list commands). A flags-only
 * scan invocation (`--site example.com`) resolves to the root command.
 *
 * A misplaced subcommand after a value flag (`--site x manifest`) still counts
 * as subcommand-shaped, so citty errors loudly instead of silently running a
 * root scan and leaving a dashboard server listening.
 */
export function isSubcommandInvocation(argv: string[], argSpec: ArgsDef = ROOT_ARGS): boolean {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token == null)
      continue
    if (!token.startsWith('-'))
      return true // a real positional survived the value-aware walk → subcommand-shaped
    const spec = argSpec[flagKey(token)]
    const takesValue = spec != null && spec.type !== 'boolean'
    const next = argv[i + 1]
    if (takesValue && !token.includes('=') && next != null && !next.startsWith('-'))
      i++ // skip the flag's value so it is not mistaken for a positional
  }
  // No real positional. Attach subCommands only when there is no non-dash token
  // at all (`--help` / `--version` / empty still list commands); a flags-only
  // scan invocation (`--site example.com`, whose value is the only non-dash
  // token) must detach so citty does not read the value as a command name.
  return !argv.some(a => !a.startsWith('-'))
}

/** Build the citty main command: root scan entry + projected subcommands. */
export function buildCli(deps: BuildCliDeps): CommandDef {
  const { subCommands } = projectCliCommands(deps.projection)
  const argv = deps.argv ?? process.argv.slice(2)
  return defineCommand({
    meta: {
      name: 'unlighthouse',
      version: deps.version,
      description: 'Scan your entire website with Google Lighthouse.',
    },
    args: ROOT_ARGS,
    subCommands: isSubcommandInvocation(argv) ? subCommands : undefined,
    async run({ args, rawArgs }) {
      await deps.runRoot(rootArgsToOptions(args as Record<string, unknown>, rawArgs), rawArgs)
    },
  })
}
