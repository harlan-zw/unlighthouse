export default {
    site: 'https://harlanzw.com',
    cache: false,
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

