import {createRouteWorkerCluster} from "./composition/createRouteProcessor";
import fs from "fs";
import {Options, Provider} from "../types";
import {createApi} from "../api";
import {defaultOptions, createLogger } from "../core";
import defu from 'defu'
import {$URL} from 'ufo'

export const createEngine = async(provider: Provider, options: Options) => {
    options = defu(options, defaultOptions) as Options

    const logger = createLogger(options.debug)

    const $url = new $URL(options.host)

    options.outputPath = `${options.outputPath}/${$url.hostname}`

    logger.info(`Saving lighthouse reports to: ${options.outputPath}`)

    if (!fs.existsSync(options.outputPath))
        fs.mkdirSync(options.outputPath, { recursive: true })

    const routeProcessor = await createRouteWorkerCluster(options)

    const api = createApi({
        routeProcessor,
        provider,
        options
    })


    return {
        api,
        routeProcessor,
        start: async() => {
            (await provider.routes()).forEach(route => {
                routeProcessor.processRoute(route)
            })
        }
    }

}
