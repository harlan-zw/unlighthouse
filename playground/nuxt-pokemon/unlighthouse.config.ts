import defineConfig from 'unlighthouse/config'

export default defineConfig({
    cacheReports: false,
    scanner: {
        throttle: false,
    },
    router: {
        prefix: '/__l'
    },
    outputPath: '.l',
    lighthouseOptions: {
        onlyCategories: ['performance', 'seo', 'accessibility']
    },
    debug: true,
})

