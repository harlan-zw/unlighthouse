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
}

/** Build the citty main command: root scan entry + projected subcommands. */
export function buildCli(deps: BuildCliDeps): CommandDef {
  const { subCommands } = projectCliCommands(deps.projection)
  return defineCommand({
    meta: {
      name: 'unlighthouse',
      version: deps.version,
      description: 'Scan your entire website with Google Lighthouse.',
    },
    args: ROOT_ARGS,
    subCommands,
    async run({ args, rawArgs }) {
      await deps.runRoot(rootArgsToOptions(args as Record<string, unknown>, rawArgs), rawArgs)
    },
  })
}
