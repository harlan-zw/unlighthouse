import { test as base } from '@playwright/test';
import type { ProductTarget } from './types.js';

/**
 * Targets are loaded once (lazily) from targets/registry.ts and cached
 * for the lifetime of the test run.
 */
let _targets: ProductTarget[] | null = null;

async function loadTargets(): Promise<ProductTarget[]> {
  if (_targets) return _targets;

  try {
    const mod = await import('../targets/registry.js');
    _targets = mod.targets as ProductTarget[];
  } catch {
    _targets = [];
  }

  return _targets;
}

/**
 * Extended Playwright `test` that provides a `target` fixture —
 * the {@link ProductTarget} matching the current Playwright project.
 *
 * Usage in spec files:
 *   import { test, expect } from '../lib/fixtures.js';
 *
 *   test('homepage loads', async ({ page, target }) => {
 *     await page.goto(target.pages[0].path);
 *   });
 */
export const test = base.extend<{ target: ProductTarget }>({
  target: async ({}, use, testInfo) => {
    const targets = await loadTargets();
    // Project name is "csv2geo [csv2geo.com]" — match on the prefix before " ["
    const projectName = testInfo.project.name.split(' [')[0];
    const target = targets.find(t => t.name === projectName);

    if (!target) {
      throw new Error(
        `No target config for project "${testInfo.project.name}". ` +
        `Check targets/registry.ts.`,
      );
    }

    await use(target);
  },
});

export { expect } from '@playwright/test';
