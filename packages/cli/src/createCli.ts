import cac from 'cac'
import { version } from '../package.json'

export default function createCli() {
  const cli = cac('unlighthouse')

  return cli
    .help()
    .version(version)
    .option('--host <host>', 'Host URL to scan')
    .example('unlighthouse --host harlanzw.com')
    .option('--root <root>', 'Root ro run lighthouse. Useful for changing where the config is read from or setting up sampling.')
    .option('--config-file <config-file>', 'Config File Path. Where to load the configuration file from.')
    .option('-d, --debug', 'Debug. Enable debugging in the logger.')
}
