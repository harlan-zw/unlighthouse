import cac from 'cac'
import { version } from '../package.json'

export default function createCli() {
  const cli = cac('unlighthouse')

  cli
      .help()
      .version(version)
      .example('unlighthouse --site harlanzw.com')

  cli.option('--site <site>', 'Host URL to scan')
  cli.option('--scanner.samples <samples>', 'Specify the amount of samples to run.')
  cli.option('--enable-javascript', 'When inspecting the HTML wait for the javascript to execute. Useful for SPAs.')
  cli.option('--disable-javascript', 'When inspecting the HTML, don\'t wait for the javascript to execute.')
  cli.option('--output-path <output-path>', 'Path to save the contents of the client and reports to.')
  cli.option('--root <root>', 'Root ro run lighthouse. Useful for changing where the config is read from or setting up sampling.')
  cli.option('--config-file <config-file>', 'Config File Path. Where to load the configuration file from.')
  cli.option('--no-cache', 'Disable the caching.')
  cli.option('--cache', 'Enable the caching.')
  cli.option('-d, --debug', 'Debug. Enable debugging in the logger.')

  return cli
}
