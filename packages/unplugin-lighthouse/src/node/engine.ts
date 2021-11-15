import {createUnlighthouseWorker} from "./worker";
import fs from "fs";
import {NormalisedRoute, Options, Provider} from "../types";
import {createApi} from "../api";
import {defaultOptions, createLogger } from "../core";
import defu from 'defu'
import {$URL} from 'ufo'
import {createMockRouter, normaliseRoute} from "./router";
import groupBy from "lodash/groupBy";
import {map, sampleSize} from "lodash";
import WS from "../server/ws";

export const createEngine = async(provider: Provider, options: Options) => {
    options = defu(options, defaultOptions) as Options

    const logger = createLogger(options.debug)

    const $url = new $URL(options.host)

    options.outputPath = `${options.outputPath}/${$url.hostname}`

    logger.info(`Saving lighthouse reports to: ${options.outputPath}`)

    if (!fs.existsSync(options.outputPath))
        fs.mkdirSync(options.outputPath, { recursive: true })

    const worker = await createUnlighthouseWorker(options)

    const ws = new WS()

    const api = createApi({
        ws,
        worker,
        provider,
        options
    })

    const initialScanPaths : () => Promise<NormalisedRoute[]> = async() => {
        if (!provider.urls || !provider.routeDefinitions) {
            return []
        }

        const routeDefinitions = await provider.routeDefinitions()
        if (!routeDefinitions) {
            return []
        }

        const mockRouter = createMockRouter(routeDefinitions)

        const urls = await provider.urls()

        // group all urls by their route definition path name
        const pathsChunkedToRouteName = groupBy(
            urls
                .map(url => normaliseRoute(url, mockRouter))
                .filter(route => route !== false),
            // @ts-ignore
            u => u.definition.name
        )

        const pathsSampleChunkedToRouteName = map(
            pathsChunkedToRouteName,
            // we're matching dynamic rates here, only taking a sample to avoid duplicate tests
            group => {
                // whatever the sampling rate is
                return sampleSize(group, 5)
            })

        console.log(pathsSampleChunkedToRouteName)

        return pathsSampleChunkedToRouteName.flat()
    }

    return {
        api,
        ws,
        worker,
        start: async() => {
            (await initialScanPaths()).forEach(route => {
                worker.processRoute(route)
            })
        }
    }

}
