import { Plugin } from '@nuxt/types'
import {getLCP, getFID, getFCP, getCLS} from 'web-vitals';
import {ReportHandler} from "web-vitals/dist/modules/types";

const webVitalsPlugin : Plugin = (ctx) => {
    console.log('web vitals')
    const reportWebVital : ReportHandler = ({name, id, value}) => {
        console.info(`[${name} ${id}] ${value}ms`);
        ctx.$config[name] = value
    }
    getFCP(reportWebVital, true)
    getCLS(reportWebVital, true)
    getFID(reportWebVital, true)
    getLCP(reportWebVital, true)
    // inject('fid', fid)
}

export default webVitalsPlugin
