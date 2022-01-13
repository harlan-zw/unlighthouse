import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
    host: 'unlighthouse.dev',
    discovery: {
        supportedExtensions: ['md']
    },
    scanner: {
        sitemap: false,
    }
})
