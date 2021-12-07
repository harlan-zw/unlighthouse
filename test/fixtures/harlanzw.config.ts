export default {
    host: 'https://harlanzw.com',
    cacheReports: false,
    scanner: {
        throttle: false,
    },
    ci: {
        budget: {
            'best-practices': 85,
            'seo': 85,
            'accessibility': 85,
        },
    },
    lighthouseOptions: {
        onlyCategories: ['best-practices', 'seo', 'accessibility']
    },
    debug: true,
}

