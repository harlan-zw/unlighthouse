import { describe, expect, it } from 'vitest'
import { isImplicitOrExplicitHtml } from '../src/util/filter'

describe('filters', () => {
  it ('misc file paths', () => {
    expect(isImplicitOrExplicitHtml('')).toBe(true)
    expect(isImplicitOrExplicitHtml('/')).toBe(true)
    expect(isImplicitOrExplicitHtml('/some.foo/test')).toBe(true)
    expect(isImplicitOrExplicitHtml('/some/file.pdf/')).toBe(true)
    expect(isImplicitOrExplicitHtml('/dist/assets/chunk[213.4.931294]')).toBe(true)

    // file paths
    expect(isImplicitOrExplicitHtml('/foo/bar.fr9f9')).toBe(false)
    expect(isImplicitOrExplicitHtml('/some/file.pdf')).toBe(false)
    expect(isImplicitOrExplicitHtml('/dist/assets/chunk[213.4.931294].css')).toBe(false)
  })
})
