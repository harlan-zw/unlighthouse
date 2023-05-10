import { describe, expect, it } from 'vitest'
import { mergeRobotsTxtConfig, parseRobotsTxt } from '../src/discovery'
import { asRegExp } from '../src/util'
import type { ResolvedUserConfig } from '../src'

describe('Robots', () => {
  it ('parses example #1', () => {
    const parsed = parseRobotsTxt(`
# START YOAST BLOCK
# ---------------------------
User-agent: *
Disallow:

Sitemap: https://kootingalpecancompany.com/sitemap_index.xml
# ---------------------------
# END YOAST BLOCK
`)
    expect(parsed).toMatchInlineSnapshot(`
      {
        "disallows": [],
        "sitemaps": [
          "https://kootingalpecancompany.com/sitemap_index.xml",
        ],
      }
    `)
  })

  it('parses example #2', () => {
    const parsed = parseRobotsTxt(`
    User-agent: *
Disallow: /account/
Disallow: /dashboard/
Disallow: /admin/
Disallow: /mod/
Allow: /$
Allow: /wiki/
`)
    expect(parsed).toMatchInlineSnapshot(`
      {
        "disallows": [
          "/account/",
          "/dashboard/",
          "/admin/",
          "/mod/",
        ],
        "sitemaps": [],
      }
    `)

    const resolvedConfig = { scanner: { exclude: [], sitemap: [] } } as any as ResolvedUserConfig
    mergeRobotsTxtConfig(resolvedConfig, parsed)

    expect(resolvedConfig).toMatchInlineSnapshot(`
      {
        "scanner": {
          "exclude": [
            "/account/.*",
            "/dashboard/.*",
            "/admin/.*",
            "/mod/.*",
          ],
          "sitemap": [],
        },
      }
    `)

    // blocked
    expect(asRegExp(resolvedConfig.scanner.exclude![0]).test('/account/test')).toBeTruthy()
  })

  it ('parsed example #3', () => {
    const parsed = parseRobotsTxt(`
    User-agent: bingbot
Crawl-delay: 10
User-agent: YandexBot
Crawl-delay: 20
User-agent: *
Disallow: /CVS
Disallow: /*.svn$
Disallow: /*.idea$
Disallow: /*.sql$
Disallow: /*.tgz$

## Specific Disallow for filters
## But accept pages

Disallow: *brand=*
Disallow: *color=*
Disallow: *color_filter=*
Disallow: *material_filter=*
Disallow: *fitting_filter=*
Disallow: *asc=price*
Disallow: *desc=price*
Disallow: *asc=name*
Disallow: *desc=name*
Disallow: *food_type=*
Disallow: *tags=*
Disallow: *size=*

## Exclude other parametric for pop-ups
Disallow: *search=*
Disallow: *popup=*
Disallow: *successRedirect=*

## Do not crawl checkout and user account pages
Disallow: */user/*
Disallow: */checkout/*
Disallow: */wishlist/*

Sitemap: https://unitedpets.com/sitemap/index.xml
`)
    expect(parsed).toMatchInlineSnapshot(`
      {
        "disallows": [
          "/CVS",
          "/*.svn$",
          "/*.idea$",
          "/*.sql$",
          "/*.tgz$",
          "*brand=*",
          "*color=*",
          "*color_filter=*",
          "*material_filter=*",
          "*fitting_filter=*",
          "*asc=price*",
          "*desc=price*",
          "*asc=name*",
          "*desc=name*",
          "*food_type=*",
          "*tags=*",
          "*size=*",
          "*search=*",
          "*popup=*",
          "*successRedirect=*",
          "*/user/*",
          "*/checkout/*",
          "*/wishlist/*",
        ],
        "sitemaps": [
          "https://unitedpets.com/sitemap/index.xml",
        ],
      }
    `)

    const resolvedConfig = { scanner: { exclude: [], sitemap: [] } } as any as ResolvedUserConfig
    mergeRobotsTxtConfig(resolvedConfig, parsed)
    expect(resolvedConfig).toMatchInlineSnapshot(`
      {
        "scanner": {
          "exclude": [
            "/CVS.*",
            "/.*.svn$",
            "/.*.idea$",
            "/.*.sql$",
            "/.*.tgz$",
            ".*brand=.*",
            ".*color=.*",
            ".*color_filter=.*",
            ".*material_filter=.*",
            ".*fitting_filter=.*",
            ".*asc=price.*",
            ".*desc=price.*",
            ".*asc=name.*",
            ".*desc=name.*",
            ".*food_type=.*",
            ".*tags=.*",
            ".*size=.*",
            ".*search=.*",
            ".*popup=.*",
            ".*successRedirect=.*",
            ".*/user/.*",
            ".*/checkout/.*",
            ".*/wishlist/.*",
          ],
          "sitemap": [
            "https://unitedpets.com/sitemap/index.xml",
          ],
        },
      }
    `)

    function isScannable(path: string) {
      return resolvedConfig.scanner.exclude!.filter(rule => asRegExp(rule).test(path)).length === 0
    }
    expect(isScannable('/CVS')).toBeFalsy()
    expect(isScannable('/test/checkout/')).toBeFalsy()
    expect(isScannable('/?size=big')).toBeFalsy()
    expect(isScannable('/my-product')).toBeTruthy()
  })
})
