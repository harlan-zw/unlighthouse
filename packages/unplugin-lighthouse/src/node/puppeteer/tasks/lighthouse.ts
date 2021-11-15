import {TaskFunction} from "puppeteer-cluster/dist/Cluster";
import {LighthouseTaskArgs, LighthouseTaskReturn} from "../../../types";
import execa from "execa";
import {join} from "path";
import fs from "fs";
import {LH} from "lighthouse";
import {pick} from "lodash";

export const normaliseLighthouseResult = (result : LH.Result) => {
    // map the json report to what values we actually need
    const report = pick(result, [
        'categories',
        // overview
        'audits.final-screenshot',
        // performance
        'audits.first-contentful-paint',
        'audits.total-blocking-time',
        'audits.cumulative-layout-shift',
        'audits.diagnostics',
        'audits.network-requests',
        // accessibility
        'audits.color-contrast',
        'audits.image-alt',
        'audits.link-name',
        // best practices
        'audits.errors-in-console',
        'audits.no-vulnerable-libraries',
        'audits.external-anchors-use-rel-noopener',
        'audits.image-aspect-ratio',
        // seo
        'audits.is-crawlable'
    ])

    // @ts-ignore
    report.score = Object.values(report.categories).map(c => c.score).reduce((s, a) => s + a, 0) / 4

    return report
}

export const runLighthouseWorker: TaskFunction<LighthouseTaskArgs, LighthouseTaskReturn> = async(props) => {
    const { page, data } = props
    const { routeReport, options } = data

    // if the report doesn't exist we're going to run a new lighthouse process to generate it
    // @todo figure out better caching
    if (!fs.existsSync(routeReport.reportJson)) {
        const browser = page.browser()
        const port = new URL(browser.wsEndpoint()).port

        const args = [
            `--routeReport=${JSON.stringify(pick(routeReport, ['route.url', 'reportJson', 'reportHtml']))}`,
            `--options=${JSON.stringify(options)}`,
            `--port=${port}`,
        ]

        // Spawn a worker process
        const worker = execa('jiti', [join(__dirname, '..', '..', 'process', 'lighthouse.ts'), ...args], {
            timeout: 6 * 60 * 1000,
        })
        worker.stdout!.pipe(process.stdout)
        worker.stderr!.pipe(process.stderr)
        const response = await worker

        if (response.failed)
            return false
    }
    routeReport.resolved = true

    const jsonReport = JSON.parse(fs.readFileSync(routeReport.reportJson, { encoding: 'utf-8' })) as LH.Result
    routeReport.report = normaliseLighthouseResult(jsonReport)
    return routeReport
}
