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
    v1Report: true,
  },
  lighthouseOptions: {
    onlyCategories: ['best-practices', 'seo', 'accessibility']
  },
  debug: true,
}

