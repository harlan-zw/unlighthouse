import cac from 'cac'
import { version } from '../package.json'

export default function createCli() {
  const cli = cac('unlighthouse')

  cli
    .help()
    .version(version)
    .example('unlighthouse --site unlighthouse.dev')
    .example('unlighthouse --site unlighthouse.dev --urls /guide,/api,/glossary --desktop')

  cli.option('--root <root>', 'Define the project root. Useful for changing where the config is read from or setting up sampling.')
  cli.option('--config-file <config-file>', 'Path to config file.')
  cli.option('--output-path <output-path>', 'Path to save the contents of the client and reports to.')
  // only `--cache` is declared: declaring `--no-cache` makes cac default `cache` to true, which overrides the config file
  cli.option('--cache', 'Enable the caching. Disable it with --no-cache.')

  cli.option('--desktop', 'Simulate device as desktop.')
  cli.option('--mobile', 'Simulate device as mobile.')

  cli.option('--site <site>', 'Host URL to scan.')
  cli.option('--user-agent <user-agent>', 'Specify a top-level user agent all requests will use.')
  cli.option('--router-prefix <site>', 'The URL path prefix for the client and API to run from.')
  cli.option('--sitemaps <sitemaps>', 'Comma separated list of sitemaps to use for scanning. Providing these will override any in robots.txt.')
  cli.option('--samples <samples>', 'Specify the amount of samples to run.')
  cli.option('--throttle', 'Enable the throttling')
  cli.option('--enable-javascript', 'When inspecting the HTML wait for the javascript to execute. Useful for SPAs.')
  cli.option('--disable-javascript', 'When inspecting the HTML, don\'t wait for the javascript to execute.')
  cli.option('--enable-i18n-pages', 'Enable scanning pages which use x-default.')
  cli.option('--disable-i18n-pages', 'Disable scanning pages which use x-default.')
  cli.option('--urls <urls>', 'Specify explicit relative paths to scan as a comma-separated list, disabling the link crawler.')
  cli.option('--exclude-urls <urls>', 'Relative paths (string or regex) to exclude as a comma-separated list.')
  cli.option('--include-urls <urls>', 'Relative paths (string or regex) to include as a comma-separated list.')
  cli.option('--disable-robots-txt', 'Disables the robots.txt crawling.')
  cli.option('--disable-sitemap', 'Disables the sitemap.xml crawling.')
  cli.option('--disable-dynamic-sampling', 'Disables the sampling of paths.')

  // add extra-headers, cookies, auth, default-query-params
  cli.option('--extra-headers <extra-headers>', 'Extra headers to send with the request. Example: --extra-headers foo=bar,bar=foo')
  cli.option('--cookies <cookies>', 'Cookies to send with the request. Example: --cookies foo=bar;bar=foo')
  cli.option('--auth <auth>', 'Basic auth to send with the request. Example: --auth username:password')
  cli.option('--default-query-params <default-query-params>', 'Default query params to send with the request. Example: --default-query-params foo=bar,bar=foo')

  cli.option('-d, --debug', 'Debug. Enable debugging in the logger.')

  return cli
}

export function createCiCli() {
  const cli = createCli()
  cli.option('--budget <budget>', 'Budget (1-100), the minimum score which can pass.')
  cli.option('--build-static', 'Build a static website for the reports which can be uploaded.')
  cli.option('--reporter <reporter>', 'The report to generate from results. Options: csv, csvExpanded, json, jsonExpanded or false. Default: json.')
  cli.option('--lhci-host <lhci-host>', 'URL of your LHCI server.')
  cli.option('--lhci-build-token <lhci-build-token>', 'LHCI build token, used to add data.')
  cli.option('--lhci-auth <lhci-auth>', 'Basic auth for your LHCI server.')
  return cli
}
