export default {
  site: 'https://harlanzw.com',
  cache: false,
  scanner: {
    device: 'desktop',
    throttle: false,
  },
  ci: {
    budget: {
      'best-practices': 80,
      'seo': 85,
      'accessibility': 85,
    },
  },
  lighthouseOptions: {
    onlyCategories: ['best-practices', 'seo', 'accessibility']
  },
  debug: true,
}

