import { defineUnlighthouseConfig } from 'unlighthouse/config'
import { describe, expect, it } from 'vitest'

describe('config types', () => {
  it('returns a typed config unchanged', () => {
    const config = defineUnlighthouseConfig({
      site: 'https://unlighthouse.dev',
      ci: {
        budget: {
          seo: 60,
        },
      },
    })

    expect(config.site).toBe('https://unlighthouse.dev')
  })
})
