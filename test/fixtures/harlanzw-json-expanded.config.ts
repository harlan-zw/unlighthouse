export default {
  site: 'https://harlanzw.com',
  cache: false,
  scanner: {
    device: 'desktop',
    throttle: false,
  },
  ci: {
    budget: {
      'best-practices': 50,
      'seo': 50,
      'accessibility': 50,
    },
    reporter: 'jsonExpanded',
  },
  debug: true,
}
