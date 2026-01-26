import { test, expect } from '../lib/fixtures.js';

function matchesExpectation(actual: string | null, expected: string | RegExp): void {
  expect(actual).toBeTruthy();
  if (expected instanceof RegExp) {
    expect(actual).toMatch(expected);
  } else {
    expect(actual).toContain(expected);
  }
}

test('pages have required SEO elements', async ({ page, target }) => {
  const seoPages = target.seo?.pages;
  test.skip(!seoPages || seoPages.length === 0, 'No SEO config');

  for (const seoPage of seoPages!) {
    await test.step(seoPage.path, async () => {
      await page.goto(seoPage.path);

      // <title>
      if (seoPage.title) {
        const title = await page.title();
        matchesExpectation(title, seoPage.title);
      }

      // <meta name="description">
      if (seoPage.description) {
        const content = await page.locator('meta[name="description"]').getAttribute('content');
        matchesExpectation(content, seoPage.description);
      }

      // og:title
      if (seoPage.ogTitle) {
        const content = await page.locator('meta[property="og:title"]').getAttribute('content');
        matchesExpectation(content, seoPage.ogTitle);
      }

      // og:image
      if (seoPage.ogImage) {
        const content = await page.locator('meta[property="og:image"]').getAttribute('content');
        matchesExpectation(content, seoPage.ogImage);
      }

      // canonical
      if (seoPage.canonical) {
        const href = await page.locator('link[rel="canonical"]').getAttribute('href');
        matchesExpectation(href, seoPage.canonical);
      }

      // h1
      if (seoPage.h1) {
        const h1 = page.locator('h1').first();
        await expect(h1).toBeVisible();
        const text = await h1.textContent();
        matchesExpectation(text, seoPage.h1);
      }

      // noindex check
      if (seoPage.noindex !== undefined) {
        const robots = await page.locator('meta[name="robots"]').getAttribute('content');
        if (seoPage.noindex) {
          expect(robots).toContain('noindex');
        } else {
          // Should NOT have noindex
          if (robots) {
            expect(robots).not.toContain('noindex');
          }
        }
      }
    });
  }
});
