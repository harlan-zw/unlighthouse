import { cp, rm } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

await rm(new URL('dist', root), { recursive: true, force: true })
await cp(new URL('.output/public', root), new URL('dist', root), { recursive: true })
