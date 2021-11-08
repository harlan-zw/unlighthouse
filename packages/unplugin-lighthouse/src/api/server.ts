import { createApi } from './router'
import { createApp } from 'h3'
import { listen } from 'listhen'
import defu from 'defu'
import {createRouteWorkerCluster} from "../node/composition/createRouteProcessor";
import {createEngine} from "../node/engine";
import {Options} from "../types";
import {extractSiteRoutes} from "../node/sitemap";


const startServer = async(options: {}) => {
    options = defu(options, {
    }) as Options

    const app = createApp()

    // await generateBuild({
    //     root,
    //     outDir: parsed.options.html,
    // })

    const { api, routeProcessor } = await createEngine({
        routes () {

        },
        async stats() {

        }
    }, options)


    app.use(api)

    const http = await listen(app, {
        open: options.open
    })

    const urls = await extractSiteRoutes(options.host)
    console.log(urls)
    routeProcessor.processRoutes(urls)

    return http
}


export { startServer }
