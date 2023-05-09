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
  cli.option('--no-cache', 'Disable the caching.')
  cli.option('--cache', 'Enable the caching.')

  cli.option('--desktop', 'Simulate device as desktop.')
  cli.option('--mobile', 'Simulate device as mobile.')

  cli.option('--site <site>', 'Host URL to scan.')
  cli.option('--router-prefix <site>', 'The URL path prefix for the client and API to run from.')
  cli.option('--sitemap-path <sitemap-path>', 'Sitemap path to use for scanning.')
  cli.option('--samples <samples>', 'Specify the amount of samples to run.')
  cli.option('--throttle', 'Enable the throttling')
  cli.option('--enable-javascript', 'When inspecting the HTML wait for the javascript to execute. Useful for SPAs.')
  cli.option('--disable-javascript', 'When inspecting the HTML, don\'t wait for the javascript to execute.')
  cli.option('--enable-i18n-pages', 'Enable scanning pages which use x-default.')
  cli.option('--disable-i18n-pages', 'Disable scanning pages which use x-default.')
  cli.option('--urls <urls>', 'Specify explicit relative paths to scan as a comma-seperated list, disabling the link crawler.')
  cli.option('--exclude-urls <urls>', 'Relative paths (string or regex) to exclude as a comma-separated list.')
  cli.option('--include-urls <urls>', 'Relative paths (string or regex) to include as a comma-separated list.')
  cli.option('--disable-robots-txt', 'Disables the robots.txt crawling.')
  cli.option('--disable-sitemap', 'Disables the sitemap.xml crawling.')
  cli.option('--disable-dynamic-sampling', 'Disables the sampling of paths.')
  cli.option('-d, --debug', 'Debug. Enable debugging in the logger.')

  return cli
}
