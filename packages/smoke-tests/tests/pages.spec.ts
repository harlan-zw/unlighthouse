import * as fs from 'node:fs';
import { test, expect } from '../lib/fixtures.js';
import { ConsoleErrorCollector } from '../lib/console-errors.js';
import { authenticate, getCachedAuthState, saveAuthState } from '../lib/auth.js';

/* ------------------------------------------------------------------ */
/*  Public pages                                                      */
/* ------------------------------------------------------------------ */

test('public pages — no JS errors, expected selectors, valid HTTP status', async ({ page, target }) => {
  const publicPages = target.pages.filter(p => !p.auth);
  test.skip(publicPages.length === 0, 'No public pages configured');

  const collector = new ConsoleErrorCollector(page, target.allowedErrors);

  for (const pageConfig of publicPages) {
    await test.step(pageConfig.name ?? pageConfig.path, async () => {
      collector.reset();

      const response = await page.goto(pageConfig.path);

      // HTTP status
      const expected = pageConfig.expectedStatus ?? 200;
      expect(
        response?.status(),
        `${pageConfig.path} returned ${response?.status()}, expected ${expected}`,
      ).toBe(expected);

      // Required selectors
      for (const selector of pageConfig.selectors ?? []) {
        await expect(
          page.locator(selector).first(),
          `Selector "${selector}" not visible on ${pageConfig.path}`,
        ).toBeVisible({ timeout: 10_000 });
      }

      // JS errors
      const errors = collector.getErrors();
      expect(
        errors,
        `JS errors on ${pageConfig.path}:\n${errors.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Authenticated pages                                               */
/* ------------------------------------------------------------------ */

test('authenticated pages — no JS errors, expected selectors', async ({ page, target, context }) => {
  const authPages = target.pages.filter(p => p.auth);
  test.skip(authPages.length === 0 || !target.auth, 'No authenticated pages configured');

  // Reuse cached auth state or perform fresh login
  const cached = getCachedAuthState(target);
  if (cached) {
    const state = JSON.parse(fs.readFileSync(cached, 'utf-8'));
    await context.addCookies(state.cookies);
  } else {
    await authenticate(page, target);
    await saveAuthState(context, target);
  }

  const collector = new ConsoleErrorCollector(page, target.allowedErrors);

  for (const pageConfig of authPages) {
    await test.step(pageConfig.name ?? pageConfig.path, async () => {
      collector.reset();

      const response = await page.goto(pageConfig.path);

      const expected = pageConfig.expectedStatus ?? 200;
      expect(
        response?.status(),
        `${pageConfig.path} returned ${response?.status()}, expected ${expected}`,
      ).toBe(expected);

      for (const selector of pageConfig.selectors ?? []) {
        await expect(
          page.locator(selector).first(),
          `Selector "${selector}" not visible on ${pageConfig.path}`,
        ).toBeVisible({ timeout: 10_000 });
      }

      const errors = collector.getErrors();
      expect(
        errors,
        `JS errors on ${pageConfig.path}:\n${errors.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  HTTP resource checks                                              */
/* ------------------------------------------------------------------ */

test('pages — no failed network requests for CSS/JS/images', async ({ page, target }) => {
  const publicPages = target.pages.filter(p => !p.auth);
  test.skip(publicPages.length === 0, 'No public pages configured');

  for (const pageConfig of publicPages) {
    await test.step(pageConfig.name ?? pageConfig.path, async () => {
      const failedResources: string[] = [];

      const handler = (response: import('@playwright/test').Response) => {
        const url = response.url();
        const status = response.status();
        const isResource =
          url.endsWith('.js') ||
          url.endsWith('.css') ||
          url.endsWith('.png') ||
          url.endsWith('.jpg') ||
          url.endsWith('.svg') ||
          url.endsWith('.woff2');

        if (isResource && (status >= 400)) {
          failedResources.push(`${status} ${url}`);
        }
      };

      page.on('response', handler);
      await page.goto(pageConfig.path, { waitUntil: 'networkidle' });
      page.removeListener('response', handler);

      expect(
        failedResources,
        `Failed resources on ${pageConfig.path}:\n${failedResources.join('\n')}`,
      ).toHaveLength(0);
    });
  }
});
