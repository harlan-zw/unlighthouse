import {createApp} from 'h3'
import {listen} from 'listhen'
import defu from 'defu'
import {createEngine} from "../node/engine";
import {CliOptions} from "../types";
import {extractSitemapRoutes} from "../node/sitemap";
import fs from "fs";
import WS from './ws'
import {IncomingMessage} from "http";

const startServer = async(options: CliOptions) => {
    options = defu(options, {}) as CliOptions

    console.log(options)

    const app = createApp()

    // @todo on-demand build
    // await generateBuild({
    //     root,
    //     outDir: parsed.options.html,
    // })

    const { api, start, ws } = await createEngine({
        routeDefinitions() {
            if (options.appPath) {
                return JSON.parse(fs.readFileSync(options.appPath + '/.nuxt/routes.json', { encoding: 'utf-8' }))
            }
        },
        async urls () {
            return await extractSitemapRoutes(options.host)
        },
    }, options)

    app.use(api)

    await start()

    const server = await listen(app, {
        open: options.open
    })

    server.server.on('upgrade', (request: IncomingMessage, socket, head) => {
        ws.handleUpgrade(request, socket, undefined)
    })
}


export { startServer }
