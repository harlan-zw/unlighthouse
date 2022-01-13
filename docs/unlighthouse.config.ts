import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
    host: 'unlighthouse.dev',
    discovery: {
        supportedExtensions: ['md']
    },
    scanner: {
        sitemap: false,
        samples: 2,
        device: 'desktop'
    },
    lighthouseOptions: {
        onlyCategories: ['performance', 'accessibility', 'seo']
    },
    hooks: {
        'resolved-config'(config) {
            // replace FCP column with server response time
            config.client.columns.performance[2] = {
                cols: {
                    xs: 2,
                    xl: 1,
                },
                label: 'Response Time',
                tooltip: 'Time for the server to respond',
                sortKey: 'numericValue',
                key: 'report.audits.server-response-time',
            }
        }
    }
})
