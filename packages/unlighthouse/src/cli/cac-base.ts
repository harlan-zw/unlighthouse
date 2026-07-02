// The `unlighthouse-ci` runner (cli/ci.ts) keeps its own cac program: it is a
// non-interactive scan-and-assert entry with CI-specific flags, not a projection
// of the command registry (that is the citty CLI in createCli.ts, D-033). This
// builds the shared base option surface CI extends.

import cac from 'cac'
import { version } from '../../package.json'

export function createCiBaseCli() {
  const cli = cac('unlighthouse-ci')

  cli
    .help()
    .version(version)

  cli.option('--root <root>', 'Define the project root. Useful for changing where the config is read from or setting up sampling.')
  cli.option('--config-file <config-file>', 'Path to config file.')
  cli.option('--output-path <output-path>', 'Path to save the contents of the client and reports to.')
  cli.option('--no-cache', 'Disable the caching.')
  cli.option('--cache', 'Enable the caching.')

  cli.option('--desktop', 'Simulate device as desktop.')
  cli.option('--mobile', 'Simulate device as mobile.')
  cli.option('--device <devices>', 'Devices to audit (comma-separated): `mobile`, `desktop`, or `mobile,desktop`.')

  cli.option('--site <site>', 'Host URL to scan.')
  cli.option('--user-agent <user-agent>', 'Specify a top-level user agent all requests will use.')
  cli.option('--router-prefix <site>', 'The URL path prefix for the client and API to run from.')
  cli.option('--sitemaps <sitemaps>', 'Comma separated list of sitemaps to use for scanning. Providing these will override any in robots.txt.')
  cli.option('--samples <samples>', 'Specify the amount of samples to run.')
  cli.option('--throttle', 'Enable the throttling')
  cli.option('--enable-javascript', 'When inspecting the HTML wait for the javascript to execute. Useful for SPAs.')
  cli.option('--disable-javascript', 'When inspecting the HTML, don\'t wait for the javascript to execute.')
  cli.option('--enable-i18n-pages', 'Scan localized (i18n) duplicate pages too, instead of skipping them.')
  cli.option('--disable-i18n-pages', 'Skip localized duplicates: pages whose x-default alternate link points to a different URL (default).')
  cli.option('--urls <urls>', 'Specify explicit relative paths to scan as a comma-separated list, disabling the link crawler.')
  cli.option('--exclude-urls <urls>', 'Relative paths (string or regex) to exclude as a comma-separated list.')
  cli.option('--include-urls <urls>', 'Relative paths (string or regex) to include as a comma-separated list.')
  cli.option('--disable-robots-txt', 'Disables the robots.txt crawling.')
  cli.option('--disable-sitemap', 'Disables the sitemap.xml crawling.')
  cli.option('--disable-dynamic-sampling', 'Disables the sampling of paths.')

  cli.option('--extra-headers <extra-headers>', 'Extra headers to send with the request. Example: --extra-headers foo=bar,bar=foo')
  cli.option('--cookies <cookies>', 'Cookies to send with the request. Example: --cookies foo=bar;bar=foo')
  cli.option('--auth <auth>', 'Basic auth to send with the request. Example: --auth username:password')
  cli.option('--default-query-params <default-query-params>', 'Default query params to send with the request. Example: --default-query-params foo=bar,bar=foo')

  cli.option('-d, --debug', 'Debug. Enable debugging in the logger.')
  cli.option('--history', 'Start the UI in history-only mode without running a scan.')
  cli.option('--assert', 'Evaluate CI assertions after scan. Exit with code 1 on failure.')

  return cli
}
