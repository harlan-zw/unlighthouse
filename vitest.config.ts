import { resolve } from 'path'
import { defineConfig, AliasOptions } from 'vite'

const r = (p: string) => resolve(__dirname, p)

export const alias: AliasOptions = {
    'unlighthouse': r('./packages/core/src/'),
    '@unlighthouse/client': r('./packages/client/src/'),
}

export default defineConfig({
    // @ts-ignore
    test: {
        testTimeout: 60000,
    },
    resolve: {
        alias,
    },
})
