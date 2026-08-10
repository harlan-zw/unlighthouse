import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const comparePage = new URL('../app/pages/sites/[siteId]/compare.vue', import.meta.url)

describe('compare mobile layout', () => {
  it('keeps filters, tabs, and split content vertically reachable at 375px', async () => {
    const source = await readFile(comparePage, 'utf8')

    expect(source).toContain('overflow-y-auto md:overflow-hidden')
    expect(source).toContain('max-md:h-[70vh] max-md:flex-none')
    expect(source).toContain('isMobile ? \'h-1.5 w-full\' : \'w-1.5\'')
    expect(source).toContain('flex flex-wrap items-center gap-4 text-xs')
    expect(source).toContain('aria-label="Filter routes by change status"')
  })
})
