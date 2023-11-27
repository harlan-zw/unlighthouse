import { describe, expect, it } from 'vitest'
import { mergeRobotsTxtConfig } from '../src/discovery'
import { asRegExp } from '../src/util'
import type { ResolvedUserConfig } from '../src'
import { parseRobotsTxt } from '../src/util/robotsTxtParser'

describe('robots', () => {
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
        "groups": [
          {
            "allow": [],
            "comment": [],
            "disallow": [
              "",
            ],
            "userAgent": [
              "*",
            ],
          },
        ],
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
        "groups": [
          {
            "allow": [
              "/$",
              "/wiki/",
            ],
            "comment": [],
            "disallow": [
              "/account/",
              "/dashboard/",
              "/admin/",
              "/mod/",
            ],
            "userAgent": [
              "*",
            ],
          },
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
          "include": [
            "/$.*",
            "/wiki/.*",
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
        "groups": [
          {
            "allow": [],
            "comment": [],
            "disallow": [
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
            "userAgent": [
              "bingbot",
              "YandexBot",
              "*",
            ],
          },
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
          "include": [],
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

  it('parses example #4', () => {
    // shopify
    const parsed = parseRobotsTxt(`
    User-agent: *
Disallow: /admin
Disallow: /cart
Disallow: /orders
Disallow: /checkouts/
Disallow: /checkout
Disallow: /58606747799/checkouts
Disallow: /58606747799/orders
Disallow: /carts
Disallow: /account
Disallow: /collections/*sort_by*
Disallow: /*/collections/*sort_by*
Disallow: /collections/*+*
Disallow: /collections/*%2B*
Disallow: /collections/*%2b*
Disallow: /*/collections/*+*
Disallow: /*/collections/*%2B*
Disallow: /*/collections/*%2b*
Disallow: /blogs/*+*
Disallow: /blogs/*%2B*
Disallow: /blogs/*%2b*
Disallow: /*/blogs/*+*
Disallow: /*/blogs/*%2B*
Disallow: /*/blogs/*%2b*
Disallow: /*?*oseid=*
Disallow: /*preview_theme_id*
Disallow: /*preview_script_id*
Disallow: /policies/
Disallow: /*/*?*ls=*&ls=*
Disallow: /*/*?*ls%3D*%3Fls%3D*
Disallow: /*/*?*ls%3d*%3fls%3d*
Disallow: /search
Disallow: /apple-app-site-association
Disallow: /.well-known/shopify/monorail
Disallow: /cdn/wpm/*.js
Sitemap: https://armeriameschieri.com/sitemap.xml
`)
    expect(parsed).toMatchInlineSnapshot(`
      {
        "groups": [
          {
            "allow": [],
            "comment": [],
            "disallow": [
              "/admin",
              "/cart",
              "/orders",
              "/checkouts/",
              "/checkout",
              "/58606747799/checkouts",
              "/58606747799/orders",
              "/carts",
              "/account",
              "/collections/*sort_by*",
              "/*/collections/*sort_by*",
              "/collections/*+*",
              "/collections/*%2B*",
              "/collections/*%2b*",
              "/*/collections/*+*",
              "/*/collections/*%2B*",
              "/*/collections/*%2b*",
              "/blogs/*+*",
              "/blogs/*%2B*",
              "/blogs/*%2b*",
              "/*/blogs/*+*",
              "/*/blogs/*%2B*",
              "/*/blogs/*%2b*",
              "/*?*oseid=*",
              "/*preview_theme_id*",
              "/*preview_script_id*",
              "/policies/",
              "/*/*?*ls=*&ls=*",
              "/*/*?*ls%3D*%3Fls%3D*",
              "/*/*?*ls%3d*%3fls%3d*",
              "/search",
              "/apple-app-site-association",
              "/.well-known/shopify/monorail",
              "/cdn/wpm/*.js",
            ],
            "userAgent": [
              "*",
            ],
          },
        ],
        "sitemaps": [
          "https://armeriameschieri.com/sitemap.xml",
        ],
      }
    `)

    const resolvedConfig = { scanner: { exclude: [], sitemap: [] } } as any as ResolvedUserConfig
    mergeRobotsTxtConfig(resolvedConfig, parsed)

    function isScannable(path: string) {
      return resolvedConfig.scanner.exclude!.filter(rule => asRegExp(rule).test(path)).length === 0
    }
    expect(isScannable('/cart')).toBeFalsy()
    expect(isScannable('/my-product')).toBeTruthy()
  })
})
