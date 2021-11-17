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
      { label: 'Screenshot', key: 'report.audits.screenshot-thumbnails', cols: 6 },
    ],
    [
      { cols: 1, label: 'FCP', sortable: true, key: 'report.audits.first-contentful-paint' },
      { cols: 1, label: 'TBT', sortable: true, key: 'report.audits.total-blocking-time' },
      { cols: 1, label: 'CLS', sortable: true, key: 'report.audits.cumulative-layout-shift' },
      { cols: 1, label: 'FID', sortable: true, key: 'report.audits.max-potential-fid' },
      { cols: 1, label: 'TTI', sortable: true, key: 'report.audits.interactive' },
      { cols: 2, label: 'Network Requests', sortable: true, key: 'report.audits.network-requests' },
      { cols: 1, label: 'Size', sortable: true, key: 'report.audits.diagnostics' },
    ],
    // accessibility
    [
      { cols: 3, label: 'Color Contrast', key: 'report.audits.color-contrast' },
      { cols: 2, label: 'Heading Order', sortable: true, key: 'report.audits.heading-order'  },
      { cols: 1, label: 'Labels', sortable: true, key: 'report.audits.label'  },
      { cols: 1, label: 'Image Alts', sortable: true, key: 'report.audits.image-alt'  },
      { cols: 1, label: 'Link Names', sortable: true, key: 'report.audits.link-name'  },
    ],
    // best practices
    [
      { cols: 2, label: 'Errors', sortable: true, key: 'report.audits.errors-in-console' },
      { cols: 2, label: 'Inspector Issues', sortable: true, key: 'report.audits.inspector-issues' },
      { cols: 2, label: 'Images Responsive', sortable: true, key: 'report.audits.image-size-responsive' },
      { cols: 2, label: 'Image Aspect Ratio', sortable: true, key: 'report.audits.image-aspect-ratio' },
    ],
    // seo
    [
      { cols: 1, label: 'Indexable', sortable: true, key: 'report.audits.is-crawlable' },
      { cols: 2, label: 'Tap Targets', sortable: true, key: 'report.audits.tap-targets' },
      { cols: 3, label: 'Meta Description', key: 'seo.description' },
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
  lighthouse: {
    formFactor: 'mobile',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },
})
