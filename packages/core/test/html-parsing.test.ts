import { describe, expect, it } from 'vitest'
import { processHtml } from '../src/puppeteer/tasks/html'

describe('html-parsing', () => {
  it('extracts seo and links', async () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Test Title</title>
        <meta name="description" content="Test Description">
        <link rel="icon" href="/favicon.png">
        <link rel="alternate" hreflang="x-default" href="https://example.com/">
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Description">
        <meta property="og:image" content="https://example.com/image.png">
      </head>
      <body>
        <a href="/internal">Internal Link</a>
        <a href="https://example.com/other-internal">Other Internal Link</a>
        <a href="https://google.com/external">External Link</a>
        <a href="javascript:void(0)">JS Link</a>
        <a href="mailto:test@example.com">Mailto Link</a>
        <a href="#anchor">Anchor Link</a>
      </body>
      </html>
    `
    const { seo, internalLinks, externalLinks } = await processHtml(html, 'https://example.com')

    expect(seo.title).toBe('Test Title')
    expect(seo.description).toBe('Test Description')
    expect(seo.favicon).toBe('/favicon.png')
    expect(seo.alternativeLangDefault).toBe('https://example.com/')
    expect(seo.alternativeLangDefaultHtml).toContain('hreflang="x-default"')
    expect(seo.og.title).toBe('OG Title')
    expect(seo.og.description).toBe('OG Description')
    expect(seo.og.image).toBe('https://example.com/image.png')
    expect(internalLinks).toContain('/internal')
    expect(internalLinks).toContain('https://example.com/other-internal')
    expect(externalLinks).toContain('https://google.com/external')
    expect(internalLinks.length).toBe(2)
    expect(externalLinks.length).toBe(1)
  })

  it('decodes HTML entities in href attributes', async () => {
    const html = `
      <body>
        <a href="/path?a=1&amp;b=2">Internal link with encoded ampersand</a>
        <a href="https://example.com/docs?x=1&amp;y=2">Absolute internal link with encoded ampersand</a>
        <a href="/path?c=1&#38;d=2">Internal link with numeric entity</a>
        <a href="https://google.com/search?q=1&amp;lang=en">External link with encoded ampersand</a>
      </body>
    `
    const { internalLinks, externalLinks } = await processHtml(html, 'https://example.com')

    expect(internalLinks).toContain('/path?a=1&b=2')
    expect(internalLinks).toContain('https://example.com/docs?x=1&y=2')
    expect(internalLinks).toContain('/path?c=1&d=2')
    expect(externalLinks).toContain('https://google.com/search?q=1&lang=en')
    expect(internalLinks.length).toBe(3)
    expect(externalLinks.length).toBe(1)
  })

  it('decodes entities once, not twice', async () => {
    const html = `<a href="/path?x=1&amp;amp;2">Source that itself encodes an ampersand entity</a>`
    const { internalLinks } = await processHtml(html, 'https://example.com')
    expect(internalLinks).toEqual(['/path?x=1&amp;2'])
  })

  it('handles meta title', async () => {
    const html = `
      <head>
        <meta name="title" content="Meta Title">
      </head>
    `
    const { seo } = await processHtml(html, 'https://example.com')
    expect(seo.title).toBe('Meta Title')
  })
})
