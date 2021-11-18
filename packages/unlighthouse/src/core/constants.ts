import { Cluster } from 'puppeteer-cluster'
import { Options } from '@shared'

export const NAME = 'unlighthouse'

export const defineOptions = (options: Partial<Options>) => {
  return options
}

export const defaultOptions = defineOptions({
  resolvedClient: require.resolve('unlighthouse-client'),
  host: '',
  groupRoutes: true,
  columns: [
    [
      { label: 'Screenshot Timeline', key: 'report.audits.screenshot-thumbnails', cols: 6 },
    ],
    [
      { cols: 1, label: 'FCP', tooltip: 'First Contentful Paint', sortKey: 'numericValue', key: 'report.audits.first-contentful-paint' },
      { cols: 1, label: 'TBT', tooltip: 'Total Blocking Time', sortKey: 'numericValue', key: 'report.audits.total-blocking-time' },
      { cols: 1, label: 'CLS', tooltip: 'Cumulative Layout Shift', sortKey: 'numericValue', key: 'report.audits.cumulative-layout-shift' },
      { cols: 1, label: 'FID', tooltip: 'Max Potential First Input Delay', sortKey: 'numericValue', key: 'report.audits.max-potential-fid' },
      { cols: 1, label: 'TTI', tooltip: 'Time To Interactive', sortKey: 'numericValue', key: 'report.audits.interactive' },
      { cols: 2, label: 'Network Requests', sortKey: 'length:details.items', key: 'report.audits.network-requests' },
      { cols: 1, label: 'Size', sortable: true, key: 'report.audits.diagnostics' },
    ],
    // accessibility
    [
      { cols: 3, label: 'Color Contrast', tooltip: 'Background and foreground colors do not have a sufficient contrast ratio.', sortKey: 'length:details.items', key: 'report.audits.color-contrast' },
      { cols: 2, label: 'Heading Order', tooltip: 'Heading elements appear in a sequentially-descending order', sortKey: 'length:details.items', key: 'report.audits.heading-order'  },
      { cols: 1, label: 'Labels', tooltip: 'Form elements have associated labels', sortKey: 'length:details.items', key: 'report.audits.label'  },
      { cols: 1, label: 'Image Alts', tooltip: 'Image elements have `[alt]` attributes', sortKey: 'length:details.items', key: 'report.audits.image-alt'  },
      { cols: 1, label: 'Link Names', tooltip: 'Links do not have a discernible name', sortKey: 'length:details.items', key: 'report.audits.link-name'  },
    ],
    // best practices
    [
      { cols: 2, label: 'Errors', tooltip: 'No browser errors logged to the console', sortKey: 'length:details.items', key: 'report.audits.errors-in-console' },
      { cols: 2, label: 'Inspector Issues', tooltip: 'No issues in the `Issues` panel in Chrome Devtools', sortKey: 'length:details.items',  key: 'report.audits.inspector-issues' },
      { cols: 2, label: 'Images Responsive', tooltip: 'Serves images with appropriate resolution', sortKey: 'length:details.items',  key: 'report.audits.image-size-responsive' },
      { cols: 2, label: 'Image Aspect Ratio', tooltip: 'Displays images with correct aspect ratio', sortKey: 'length:details.items',  key: 'report.audits.image-aspect-ratio' },
    ],
    // seo
    [
      { cols: 1, label: 'Indexable', tooltip: 'Page isn’t blocked from indexing',  key: 'report.audits.is-crawlable' },
      { cols: 2, label: 'Internal Links', sortable: true, key: 'seo.internalLinks' },
      { cols: 1, label: 'Tap Targets', tooltip: 'Tap targets are sized appropriately', key: 'report.audits.tap-targets' },
      { cols: 2, label: 'Meta Description', key: 'seo.description' },
      { cols: 2, label: 'Share Image', key: 'seo.og.image' },
    ]
  ],
  clientPrefix: '/__lighthouse',
  apiPrefix: '/api',
  outputPath: './.lighthouse',
  debug: true,
  dynamicRouteSampleSize: 5,

  puppeteerOptions: {
    args: [],
  },
  puppeteerClusterOptions: {
    monitor: true,
    workerCreationDelay: 500,
    retryLimit: 5,
    timeout: 5 * 60 * 1000, // wait for up to 5 minutes.
    maxConcurrency: 5,
    skipDuplicateUrls: false,
    retryDelay: 1000,
    // Important, when using Lighthouse we want browser isolation.
    concurrency: Cluster.CONCURRENCY_BROWSER,
  },
  lighthouseOptions: {
    formFactor: 'mobile',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },
})
