// pull out client accessible options
import CellComponentName from '../components/Cell/CellComponentName.vue'
import CellNetworkRequests from '../components/Cell/CellNetworkRequests.vue'
import CellDiagnostics from '../components/Cell/CellDiagnostics.vue'
import CellColorContrast from '../components/Cell/CellColorContrast.vue'
import CellMetaDescription from '../components/Cell/CellMetaDescription.vue'
import CellIndexable from '../components/Cell/CellIndexable.vue'
import CellScreenshotThumbnails from '../components/Cell/CellScreenshotThumbnails.vue'
import CellImage from '../components/Cell/CellImage.vue'

const {
    host,
    columns: configColumns,
    wsUrl,
    apiUrl,
    groupRoutes,
    hasDefinitions
} = window.__unlighthouse_options

export { wsUrl, apiUrl, groupRoutes, hasDefinitions }

export const website = host

// map the column components
export const columns = configColumns
    .map(columns => {
        return columns.map((column) => {
            switch(column.key) {
                case 'route.definition.componentBaseName':
                    column.component = CellComponentName
                    break
                case 'report.audits.network-requests':
                    column.component = CellNetworkRequests
                    break
                case 'report.audits.diagnostics':
                    column.component = CellDiagnostics
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
            }
            return column
        })
    })
