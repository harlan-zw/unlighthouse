// pull out client accessible options
import CellNetworkRequests from '../components/Cell/CellNetworkRequests.vue'
import CellImageIssues from '../components/Cell/CellImageIssues.vue'
import CellColorContrast from '../components/Cell/CellColorContrast.vue'
import CellMetaDescription from '../components/Cell/CellMetaDescription.vue'
import CellIndexable from '../components/Cell/CellIndexable.vue'
import CellScreenshotThumbnails from '../components/Cell/CellScreenshotThumbnails.vue'
import CellImage from '../components/Cell/CellImage.vue'
import CellTapTargets from '../components/Cell/CellTapTargets.vue'
import startCase from 'lodash/startCase'

const {
    host,
    client: {
        columns: configColumns,
        groupRoutesKey
    },
    hasRouteDefinitions,
    websocketUrl: wsUrl,
    apiUrl,
    lighthouseOptions,
    scanner: {
        throttle
    }
} = window.__unlighthouse_options

export { wsUrl, apiUrl, groupRoutesKey, lighthouseOptions, hasRouteDefinitions, throttle }

export const website = host

export const categories = (lighthouseOptions?.onlyCategories ||  ['performance', 'accessibility', 'best-practices', 'seo'])
console.log(categories)
export const tabs = [
    'Overview',
    ...categories.map((c) => {
        if (c === 'seo') {
            return 'SEO'
        }
        if (c == 'pwa') {
            return 'PWA'
        }
        return startCase(c)
    })
]

// map the column components
export const columns = Object.values(configColumns)
    .map(columns => {
        return columns.map((column) => {
            switch(column.key) {
                case 'report.audits.network-requests':
                    column.component = CellNetworkRequests
                    break
                case 'report.audits.diagnostics':
                    column.component = CellImageIssues
                    break
                case 'report.audits.color-contrast':
                    column.component = CellColorContrast
                    break
                case 'seo.description':
                    column.component = CellMetaDescription
                    break
                case 'report.audits.is-crawlable':
                    column.component = CellIndexable
                    break
                case 'report.audits.screenshot-thumbnails':
                    column.component = CellScreenshotThumbnails
                    break
                case 'seo.og.image':
                    column.component = CellImage
                    break
                case 'report.audits.tap-targets':
                    column.component = CellTapTargets
                    break
            }
            return column
        })
    })
