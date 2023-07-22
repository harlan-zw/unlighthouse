import os from 'node:os'
import { Cluster } from 'puppeteer-cluster'
import type { UnlighthouseColumn, UnlighthouseTabs, UserConfig } from './types'

export const AppName = 'Unlighthouse'
export const ClientPkg = '@unlighthouse/client'
export const DefaultModuleRouterPrefix = '/__unlighthouse'
export const TagLine = 'Scan your entire website with Google Lighthouse.'

export const DefaultColumns: Record<UnlighthouseTabs, UnlighthouseColumn[]> = {
  'overview': [
    {
      label: 'Screenshot Timeline',
      key: 'report.audits.screenshot-thumbnails',
      cols: 6,
    },
  ],
  'performance': [
    {
      cols: 2,
      label: 'Largest Contentful Paint',
      tooltip: 'Largest Contentful Paint marks the time at which the largest text or image is painted. [Learn more](https://web.dev/lighthouse-largest-contentful-paint/)',
      key: 'report.audits.largest-contentful-paint',
      sortKey: 'numericValue',
    },
    {
      cols: 2,
      label: 'Cumulative Layout Shift',
      tooltip: 'Cumulative Layout Shift measures the movement of visible elements within the viewport.',
      sortKey: 'numericValue',
      key: 'report.audits.cumulative-layout-shift',
    },
    {
      cols: 1,
      label: 'FID',
      tooltip: 'The maximum potential First Input Delay that your users could experience is the duration of the longest task. [Learn more](https://web.dev/lighthouse-max-potential-fid/).',
      sortKey: 'numericValue',
      key: 'report.audits.max-potential-fid',
    },
    {
      cols: 1,
      label: 'Blocking',
      tooltip: 'Sum of all time periods between FCP and Time to Interactive, when task length exceeded 50ms, expressed in milliseconds. [Learn more](https://web.dev/lighthouse-total-blocking-time/).',
      sortKey: 'numericValue',
      key: 'report.audits.total-blocking-time',
    },
    {
      cols: 2,
      label: 'Network Requests',
      sortKey: 'length:details.items',
      tooltip: 'The requests made during the page render. The size unit is the transfer size of the resources, typically gzipped.',
      key: 'report.audits.network-requests',
    },
  ],
  // accessibility
  'accessibility': [
    {
      cols: 3,
      label: 'Color Contrast',
      tooltip: 'Background and foreground colors do not have a sufficient contrast ratio.',
      sortKey: 'length:details.items',
      key: 'report.audits.color-contrast',
    },
    {
      cols: 1,
      label: 'Headings',
      tooltip: 'Heading elements appear in a sequentially-descending order',
      sortKey: 'length:details.items',
      key: 'report.audits.heading-order',
    },
    {
      cols: 1,
      label: 'ARIA',
      tooltip: 'An aggregate of all ARIA audits.',
      sortKey: 'displayValue',
      sortable: true,
      key: 'report.computed.ariaIssues',
    },
    {
      cols: 1,
      label: 'Labels',
      tooltip: 'Form elements have associated labels',
      sortKey: 'length:details.items',
      key: 'report.audits.label',
    },
    {
      cols: 1,
      label: 'Image Alts',
      tooltip: 'Image elements have [alt] attributes',
      sortKey: 'length:details.items',
      key: 'report.audits.image-alt',
    },
    {
      cols: 1,
      label: 'Link Names',
      tooltip: 'Links do not have a discernible name',
      sortKey: 'length:details.items',
      key: 'report.audits.link-name',
    },
  ],
  // best practices
  'best-practices': [
    {
      cols: 2,
      label: 'Errors',
      tooltip: 'No browser errors logged to the console',
      sortKey: 'length:details.items',
      key: 'report.audits.errors-in-console',
    },
    {
      cols: 2,
      label: 'Inspector Issues',
      tooltip: 'No issues in the `Issues` panel in Chrome Devtools',
      sortKey: 'length:details.items',
      key: 'report.audits.inspector-issues',
    },
    {
      cols: 2,
      label: 'Images Responsive',
      tooltip: 'Serves images with appropriate resolution',
      sortKey: 'length:details.items',
      key: 'report.audits.image-size-responsive',
    },
    {
      cols: 2,
      label: 'Image Aspect Ratio',
      tooltip: 'Displays images with correct aspect ratio',
      sortKey: 'length:details.items',
      key: 'report.audits.image-aspect-ratio',
    },
  ],
  // seo
  'seo': [
    {
      cols: 1,
      label: 'Indexable',
      tooltip: 'Page isn’t blocked from indexing',
      key: 'report.audits.is-crawlable',
    },
    { cols: 1, label: 'Internal link', sortable: true, key: 'seo.internalLinks' },
    { cols: 1, label: 'External link', sortable: true, key: 'seo.externalLinks' },
    {
      cols: 1,
      label: 'Tap Targets',
      tooltip: 'Tap targets are sized appropriately',
      key: 'report.audits.tap-targets',
    },
    {
      cols: 2,
      label: 'Description',
      key: 'seo.description',
    },
    {
      cols: 2,
      label: 'Share Image',
      key: 'seo.og.image',
    },
  ],
  'pwa': [
    {
      cols: 2,
      label: 'Manifest',
      key: 'report.audits.installable-manifest',
    },
    { cols: 1, label: 'Service Worker', key: 'report.audits.service-worker' },
    { cols: 1, label: 'Splash Screen', key: 'report.audits.splash-screen' },
    {
      cols: 2,
      label: 'Viewport',
      key: 'report.audits.viewport',
    },
    {
      cols: 2,
      label: 'Content Width',
      key: 'report.audits.content-width',
    },
  ],
}

export const defaultConfig: UserConfig = {
  routerPrefix: '/',
  apiPrefix: '/api',
  cache: true,
  client: {
    /**
     * By default try and group routes by the definition name, if no definition is found this will resolve
     * to the route.path.
     */
    groupRoutesKey: 'route.definition.name',
    columns: DefaultColumns,
  },
  scanner: {
    customSampling: {},
    ignoreI18nPages: true,
    maxRoutes: 200,
    skipJavascript: true,
    samples: 1,
    throttle: false,
    crawler: true,
    dynamicSampling: 8,
    sitemap: true,
    robotsTxt: true,
    device: 'mobile',
  },
  // @ts-expect-error provided by server package, may not be provided in CI mode
  server: {
    port: 5678,
    showURL: false,
    open: true,
  },
  discovery: {
    supportedExtensions: ['vue', 'md'],
    pagesDir: 'pages',
  },
  root: process.cwd(),
  outputPath: '.unlighthouse',
  debug: false,

  puppeteerOptions: {},
  puppeteerClusterOptions: {
    monitor: true,
    workerCreationDelay: 500,
    retryLimit: 3,
    timeout: 5 * 60 * 1000, // wait for up to 5 minutes.
    // max concurrency is the amount of cpu cores we have
    maxConcurrency: os.cpus().length,
    skipDuplicateUrls: false,
    retryDelay: 2000,
    // Important, when using Lighthouse we want browser isolation.
    concurrency: Cluster.CONCURRENCY_BROWSER,
  },
  lighthouseOptions: {
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },
}
