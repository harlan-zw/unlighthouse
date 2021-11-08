import {createApp} from 'h3'
import {listen} from 'listhen'
import defu from 'defu'
import {createEngine} from "../node/engine";
import {CliOptions, RouteDefinition} from "../types";
import {extractSitemapRoutes} from "../node/sitemap";


const startServer = async(options: CliOptions) => {
    options = defu(options, {}) as CliOptions

    const app = createApp()

    // @todo on-demand build
    // await generateBuild({
    //     root,
    //     outDir: parsed.options.html,
    // })

    const { api, start } = await createEngine({
        async routes () {
            return await extractSitemapRoutes(options.host) as unknown as RouteDefinition[]
        },
    }, options)

    app.use(api)

    await start()

    return await listen(app, {
        open: options.open
    })
}


export { startServer }
