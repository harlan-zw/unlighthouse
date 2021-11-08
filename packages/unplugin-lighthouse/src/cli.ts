import { resolve } from 'path'
import cac from 'cac'
import { version } from '../package.json'
// import { runAnalysis } from './analysis'
// import { startServer } from './server'
// import { generateBuild } from './build'
import { startServer } from './api'

const cli = cac('lighthouse')

cli
    .help()
    .version(version)
    .option('--host <host>', 'Host')
    .option('--port <port>', 'Port', { default: 8115 })
    .option('--open', 'Open in browser', { default: true })
    .option('--json [filepath]', 'Output analysis result file in JSON')
    .option('--html [dir]', 'Output analysis result in static web app')

const parsed = cli.parse()

async function run() {
    const root = resolve(cli.args[0] || process.cwd())
    if (parsed.options.help)
        return

    // await generateBuild({
    //     root,
    //     outDir: parsed.options.html,
    // })


    await startServer({
        ...parsed.options,
        root,
    })
}

run()
