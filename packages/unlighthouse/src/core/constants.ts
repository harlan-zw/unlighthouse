import os from 'os'
import { Cluster } from 'puppeteer-cluster'
import defineConfig from "./defineConfig";

export const APP_NAME = 'unlighthouse'
export const CLIENT_NAME = 'unlighthouse-client'
export const MODULE_ROUTER_PREFIX = '/__unlighthouse'


const tinyThenHiddenCols = {
  xs: 0,
  xl: 1,
}

const tinyThenGrowsCols = {
  xs: 2,
  xl: 1,
}

const midThenGrowsCols = {
  xs: 4,
  xl: 2,
}

const midThenHiddenCols = {
  xs: 0,
  xl: 2,
}

export const defaultColumns = {
  'overview': [
    {
      label: 'Screenshot Timeline',
      key: 'report.audits.screenshot-thumbnails',
      cols: {
        xs: 0,
        lg: 4,
        xl: 6,
      },
    },
  ],
  'performance': [
    {
      cols: {
        xs: 0,
        lg: 2,
        xl: 1,
      },
      label: 'FCP',
      tooltip: 'First Contentful Paint',
      sortKey: 'numericValue',
      key: 'report.audits.first-contentful-paint',
    },
    {
      cols: {
        xs: 3,
        lg: 2,
        xl: 1,
      },
      label: 'TBT',
      tooltip: 'Total Blocking Time',
      sortKey: 'numericValue',
      key: 'report.audits.total-blocking-time',
    },
    {
      cols: {
        xs: 2,
        xl: 1,
      },
      label: 'CLS',
      tooltip: 'Cumulative Layout Shift',
      sortKey: 'numericValue',
      key: 'report.audits.cumulative-layout-shift',
    },
    {
      cols: {
        xs: 0,
        xl: 1,
      },
      label: 'FID',
      tooltip: 'Max Potential First Input Delay',
      sortKey: 'numericValue',
      key: 'report.audits.max-potential-fid',
    },
    {
      cols: {
        xs: 0,
        xl: 1,
      },
      label: 'TTI',
      tooltip: 'Time To Interactive',
      sortKey: 'numericValue',
      key: 'report.audits.interactive',
    },
    {
      cols: {
        xl: 2,
        xs: 0,
      },
      label: 'Network Requests',
      sortKey: 'length:details.items',
      key: 'report.audits.network-requests',
    },
    { cols: tinyThenHiddenCols, label: 'Img Issues', sortKey: 'displayValue', sortable: true, key: 'report.computed.imageIssues' },
  ],
  // accessibility
  'accessibility': [
    {
      cols: {
        xs: 3,
      },
      label: 'Color Contrast',
      tooltip: 'Background and foreground colors do not have a sufficient contrast ratio.',
      sortKey: 'length:details.items',
      key: 'report.audits.color-contrast',
    },
    {
      cols: midThenHiddenCols,
      label: 'Heading Order',
      tooltip: 'Heading elements appear in a sequentially-descending order',
      sortKey: 'length:details.items',
      key: 'report.audits.heading-order',
    },
    {
      cols: {
        xs: 0,
        lg: 1,
      },
      label: 'Labels',
      tooltip: 'Form elements have associated labels',
      sortKey: 'length:details.items',
      key: 'report.audits.label',
    },
    {
      cols: tinyThenGrowsCols,
      label: 'Image Alts',
      tooltip: 'Image elements have `[alt]` attributes',
      sortKey: 'length:details.items',
      key: 'report.audits.image-alt',
    },
    {
      cols: tinyThenHiddenCols,
      label: 'Link Names',
      tooltip: 'Links do not have a discernible name',
      sortKey: 'length:details.items',
      key: 'report.audits.link-name',
    },
  ],
  // best practices
  'best-practices': [
    {
      cols: {
        xs: 2,
      },
      label: 'Errors',
      tooltip: 'No browser errors logged to the console',
      sortKey: 'length:details.items',
      key: 'report.audits.errors-in-console',
    },
    {
      cols: {
        xs: 0,
        lg: 2,
      },
      label: 'Inspector Issues',
      tooltip: 'No issues in the `Issues` panel in Chrome Devtools',
      sortKey: 'length:details.items',
      key: 'report.audits.inspector-issues',
    },
    {
      cols: {
        xs: 3,
        lg: 2,
      },
      label: 'Images Responsive',
      tooltip: 'Serves images with appropriate resolution',
      sortKey: 'length:details.items',
      key: 'report.audits.image-size-responsive',
    },
    {
      cols: midThenHiddenCols,
      label: 'Image Aspect Ratio',
      tooltip: 'Displays images with correct aspect ratio',
      sortKey: 'length:details.items',
      key: 'report.audits.image-aspect-ratio',
    },
  ],
  // seo
  'seo': [
    {
      cols: tinyThenHiddenCols,
      label: 'Indexable',
      tooltip: 'Page isn’t blocked from indexing',
      key: 'report.audits.is-crawlable',
    },
    { cols: tinyThenHiddenCols, label: 'Internal link', sortable: true, key: 'seo.internalLinks' },
    { cols: tinyThenHiddenCols, label: 'External link', sortable: true, key: 'seo.externalLinks' },
    {
      cols: tinyThenHiddenCols,
      label: 'Tap Targets',
      tooltip: 'Tap targets are sized appropriately',
      key: 'report.audits.tap-targets',
    },
    {
      cols: {
        xs: 2,
        lg: 3,
        xl: 2,
      },
      label: 'Description',
      key: 'seo.description',
    },
    {
      cols: {
        xs: 3,
        xl: 2,
      },
      label: 'Share Image',
      key: 'seo.og.image',
    },
  ],
  'pwa': [
    { cols: tinyThenHiddenCols, label: 'Manifest', key: 'report.audits.installable-manifest' },
    { cols: midThenGrowsCols, label: 'Service Worker', key: 'report.audits.service-worker' },
    { cols: midThenHiddenCols, label: 'Splash Screen', key: 'report.audits.splash-screen' },
    { cols: tinyThenHiddenCols, label: 'Viewport', key: 'report.audits.viewport' },
    { cols: midThenGrowsCols, label: 'Content Width', key: 'report.audits.content-width' },
  ],
}

export const defaultConfig = defineConfig({
  router: {
    // no prefix by default
    prefix: '',
  },
  api: {
    prefix: '/api',
  },
  cacheReports: true,
  client: {
    /**
         * By default try and group routes by the definition name, if no definition is found this will resolve
         * to the route.path.
         */
    groupRoutesKey: 'route.definition.name',
    columns: defaultColumns,
  },
  scanner: {
    isHtmlSSR: true,
    samples: 1,
    throttle: true,
    crawler: true,
    dynamicSampling: 5,
  },
  server: {
    open: true,
  },
  root: process.cwd(),
  outputPath: '.lighthouse',
  debug: false,

  puppeteerOptions: {},
  puppeteerClusterOptions: {
    monitor: true,
    workerCreationDelay: 500,
    retryLimit: 5,
    timeout: 5 * 60 * 1000, // wait for up to 5 minutes.
    // max concurrency is the amount of cpu cores we have
    maxConcurrency: os.cpus().length,
    skipDuplicateUrls: false,
    retryDelay: 1000,
    // Important, when using Lighthouse we want browser isolation.
    concurrency: Cluster.CONCURRENCY_BROWSER,
  },
  lighthouseOptions: {
    formFactor: 'mobile',
  },
})
