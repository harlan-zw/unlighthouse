import {TaskFunction} from "puppeteer-cluster/dist/Cluster";
import {LighthouseTaskArgs, LighthouseTaskReturn, Options, RouteReport} from "../../../types";
import execa from "execa";
import {join} from "path";
import fs from "fs";
import {LH} from "lighthouse";

export const runLighthouseWorker: TaskFunction<LighthouseTaskArgs, LighthouseTaskReturn> = async(props) => {
    const { page, data } = props
    const { routeReport, options } = data
    const browser = page.browser()
    const port = new URL(browser.wsEndpoint()).port

    const args = [
        `--routeReport=${JSON.stringify(routeReport)}`,
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

    routeReport.resolved = true
    routeReport.report = JSON.parse(fs.readFileSync(routeReport.reportJson, { encoding: 'utf-8' })) as LH.Result

    if (routeReport.report) {
        // @ts-ignore
        routeReport.score = Object.values(routeReport.report.categories).map(c => c.score).reduce((s, a) => s + a, 0) / 4
        console.log(routeReport.score)
    }

    return routeReport
}
