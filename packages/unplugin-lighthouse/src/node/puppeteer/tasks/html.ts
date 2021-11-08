import {TaskFunction} from "puppeteer-cluster/dist/Cluster";
import cheerio, {CheerioAPI} from "cheerio";
import {LighthouseTaskArgs, LighthouseTaskReturn} from "../../../types";
import {Page} from "puppeteer";

export const inspectHtmlTask: TaskFunction<LighthouseTaskArgs, LighthouseTaskReturn> = async(props) => {
    const {page, data} = props
    const {routeReport, options} = data

    const html = await extractHtmlPayload(page, routeReport.fullRoute)

    const $ = cheerio.load(html)
    routeReport.seo = processSeoMeta($)
    return routeReport
}

export const extractHtmlPayload: (page: Page, route: string) => Promise<string> = async(page, route) => {
    // get page html content
    const pageVisit = await page.goto(route, { waitUntil: 'domcontentloaded' })
    return await pageVisit.text()
}

export const processSeoMeta = ($: CheerioAPI) => {
    return {
        title: $('head > title').text(),
        description: $('meta[name=\'description\']').attr('content'),
        image: $('meta[property=\'image\']').attr('content') || $('meta[property=\'og:image\']').attr('content'),
    }
}
