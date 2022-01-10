import defineConfig from 'unlighthouse/config'

export default defineConfig({
    cacheReports: false,
    scanner: {
        throttle: false,
    },
    debug: true,
})

