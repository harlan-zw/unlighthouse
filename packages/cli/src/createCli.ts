import cac from 'cac'
import { version } from '../package.json'

export default function createCli() {
  const cli = cac('unlighthouse')

  return cli
    .help()
    .version(version)
    .option('--site <site>', 'Host URL to scan')
    .option('--site <site>', 'Alias for --site')
      .option('--samples <scanner.samples>', 'Specify the amount of samples to run.')
    .example('unlighthouse --site harlanzw.com')
    .option('--output-path <output-path>', 'Path to save the contents of the client and reports to.')
    .option('--root <root>', 'Root ro run lighthouse. Useful for changing where the config is read from or setting up sampling.')
    .option('--config-file <config-file>', 'Config File Path. Where to load the configuration file from.')
    .option('--no-cache', 'Disable the caching.')
    .option('--cache', 'Enable the caching.')
    .option('-d, --debug', 'Debug. Enable debugging in the logger.')
}
