import { createFilter } from '@unlighthouse/core/util/filter'
import { describe, expect, it } from 'vitest'

describe('createFilter', () => {
  it('passes everything when no rules', () => {
    const f = createFilter()
    expect(f('/anything')).toBe(true)
    expect(f('/products/deep/page')).toBe(true)
  })

  describe('include — folder patterns cover the whole subtree (#152, #385)', () => {
    // The regression: `include: ['/products']` (or the `/products/*` form our
    // own docs showed) used to match only `/products` and its direct children,
    // silently dropping deep URLs like product-detail pages.
    it('plain folder matches the folder and every descendant', () => {
      const f = createFilter({ include: ['/products'] })
      expect(f('/products')).toBe(true)
      expect(f('/products/item-123')).toBe(true)
      expect(f('/products/cat/item-123')).toBe(true)
    })

    it('single-level glob also reaches deeper paths', () => {
      const f = createFilter({ include: ['/products/*'] })
      expect(f('/products/item-123')).toBe(true)
      expect(f('/products/cat/item-123')).toBe(true)
    })

    it('explicit recursive glob is respected as-is', () => {
      const f = createFilter({ include: ['/products/**'] })
      expect(f('/products/cat/item-123')).toBe(true)
    })

    it('does not match a different folder', () => {
      const f = createFilter({ include: ['/products'] })
      expect(f('/blog/post')).toBe(false)
    })

    it('does not over-match a sibling with the same prefix', () => {
      // `/products` must NOT swallow `/products-other`.
      const f = createFilter({ include: ['/products'] })
      expect(f('/products-other')).toBe(false)
    })

    it('honours multiple include folders', () => {
      const f = createFilter({ include: ['/articles', '/authors'] })
      expect(f('/articles/2024/my-post')).toBe(true)
      expect(f('/authors/jane')).toBe(true)
      expect(f('/shop/item')).toBe(false)
    })
  })

  describe('exclude — folder patterns drop the whole subtree symmetrically', () => {
    it('excludes the folder and every descendant', () => {
      const f = createFilter({ exclude: ['/admin'] })
      expect(f('/admin')).toBe(false)
      expect(f('/admin/users/42')).toBe(false)
      expect(f('/public/page')).toBe(true)
    })
  })

  it('supports RegExp rules', () => {
    const f = createFilter({ include: [/^\/products\//] })
    expect(f('/products/deep/page')).toBe(true)
    expect(f('/blog/post')).toBe(false)
  })
})
