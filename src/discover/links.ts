export interface Alternate {
  hreflang: string
  href: string
}

export interface PageLinks {
  links: string[]
  canonical: string | null
  noindex: boolean
  lang: string | null
  alternates: Alternate[]
}

export async function extractLinks(html: string, pageUrl: string): Promise<PageLinks> {
  const hrefs: string[] = []
  let base = pageUrl
  let canonical: string | null = null
  let noindex = false
  let lang: string | null = null
  const declared: Alternate[] = []

  const rewriter = new HTMLRewriter()
    .on('base[href]', {
      element(el) {
        const href = el.getAttribute('href')
        if (href) {
          try {
            base = new URL(href, pageUrl).href
          }
          catch {}
        }
      },
    })
    .on('a[href], area[href]', {
      element(el) {
        const href = el.getAttribute('href')
        if (href && !el.hasAttribute('download'))
          hrefs.push(href)
      },
    })
    .on('link[rel][href]', {
      element(el) {
        const rel = el.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? []
        if (rel.includes('canonical'))
          canonical = el.getAttribute('href')
        const hreflang = el.getAttribute('hreflang')?.trim()
        const href = el.getAttribute('href')
        if (rel.includes('alternate') && hreflang && href)
          declared.push({ hreflang, href })
      },
    })
    .on('html[lang]', {
      element(el) {
        lang ??= el.getAttribute('lang')?.trim() || null
      },
    })
    .on('meta[name][content]', {
      element(el) {
        const name = el.getAttribute('name')?.toLowerCase()
        if ((name === 'robots' || name === 'unlighthouse') && /noindex/i.test(el.getAttribute('content') ?? ''))
          noindex = true
      },
    })

  await rewriter.transform(new Response(html)).text()

  const links: string[] = []
  for (const href of hrefs) {
    if (/^(?:mailto|tel|javascript|data|sms|ftp):/i.test(href))
      continue
    try {
      links.push(new URL(href, base).href)
    }
    catch {}
  }
  let canonicalUrl: string | null = null
  if (canonical) {
    try {
      canonicalUrl = new URL(canonical, base).href
    }
    catch {}
  }
  const alternates: Alternate[] = []
  for (const alternate of declared) {
    try {
      alternates.push({ hreflang: alternate.hreflang, href: new URL(alternate.href, base).href })
    }
    catch {}
  }
  return { links, canonical: canonicalUrl, noindex, lang, alternates }
}
