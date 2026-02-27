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
