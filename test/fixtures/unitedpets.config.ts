export default {
  site: 'https://unitedpets.com',
  outputPath: 'unitedpets-uci',
  ci: {
    // budget: {
    //   performance: 50,
    //   accessibility: 100,
    //   'best-practices': 90,
    //   seo: 90,
    // },
    buildStatic: true
  },
  scanner: {
    sitemapPath: 'sitemap/index.xml',
    maxRoutes: 50,
    device: 'desktop'
  },
  debug: true
}
