import { describe, it } from 'vitest'
import { defineConfig } from 'unlighthouse'

describe('types', () => {
  it('cache on', async () => {
    defineConfig({
      site: 'https://unlighthouse.dev',
      ci: {
        budget: {
          seo: 60,
        }
      }
    })
  })
})
