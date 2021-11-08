import {Cluster} from "puppeteer-cluster";

export const NAME = 'unplugin-lighthouse'
export const PLUGIN_PATH_PREFIX = '/__routes'
export const NUXT_CONFIG_KEY = 'lighthouse'

export const defaultOptions = {
    outputPath: './.lighthouse',
    debug: true,
    puppeteerOptions: {
        args: [],
    },
    puppeteerClusterOptions: {
        monitor: false,
        workerCreationDelay: 500,
        retryLimit: 5,
        timeout: 5 * 60 * 1000, // wait for up to 5 minutes.
        maxConcurrency: 2,
        skipDuplicateUrls: false,
        retryDelay: 1000,
        concurrency: Cluster.CONCURRENCY_BROWSER, // Important, when using Lighthouse we want browser isolation.
    },
    lighthouse: {
        // desktop @todo swap out depending what we're testing
        formFactor: 'desktop',
        screenEmulation: { disabled: true },
        throttling: {
            rttMs: 0,
            throughputKbps: 0,
            cpuSlowdownMultiplier: 0,
            requestLatencyMs: 0, // 0 means unset
            downloadThroughputKbps: 0,
            uploadThroughputKbps: 0,
        },
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    },
}
