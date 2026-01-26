import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../lib/fixtures.js';
import { ConsoleErrorCollector } from '../lib/console-errors.js';
import { authenticate, getCachedAuthState, saveAuthState } from '../lib/auth.js';
import type { FlowStep } from '../lib/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function executeStep(page: import('@playwright/test').Page, step: FlowStep): Promise<void> {
  switch (step.action) {
    case 'goto':
      await page.goto(step.path!);
      break;
    case 'click':
      await page.locator(step.selector!).click();
      break;
    case 'fill':
      await page.locator(step.selector!).fill(step.value!);
      break;
    case 'upload':
      await page.locator(step.selector!).setInputFiles(
        path.resolve(__dirname, '..', step.value!),
      );
      break;
    case 'wait':
      if (step.selector) {
        await page.locator(step.selector).waitFor({
          state: 'visible',
          timeout: step.timeout ?? 10_000,
        });
      } else {
        await page.waitForTimeout(step.timeout ?? 1_000);
      }
      break;
    case 'select':
      await page.locator(step.selector!).selectOption(step.value!);
      break;
    case 'press':
      if (step.selector) {
        await page.locator(step.selector).press(step.value!);
      } else {
        await page.keyboard.press(step.value!);
      }
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  Public flows                                                      */
/* ------------------------------------------------------------------ */

test('public flows complete without errors', async ({ page, target }) => {
  const flows = (target.flows ?? []).filter(f => !f.auth);
  test.skip(flows.length === 0, 'No public flows configured');

  for (const flow of flows) {
    await test.step(flow.name, async () => {
      const collector = new ConsoleErrorCollector(page, target.allowedErrors);

      for (const step of flow.steps) {
        await executeStep(page, step);
      }

      // Expected selectors after flow completes
      for (const selector of flow.expectSelectors ?? []) {
        await expect(
          page.locator(selector).first(),
          `Selector "${selector}" not visible after flow "${flow.name}"`,
        ).toBeVisible({ timeout: 10_000 });
      }

      // JS error assertion (default: enabled)
      if (flow.expectNoJsErrors !== false) {
        const errors = collector.getErrors();
        expect(
          errors,
          `JS errors in flow "${flow.name}":\n${errors.join('\n')}`,
        ).toHaveLength(0);
      }
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Authenticated flows                                               */
/* ------------------------------------------------------------------ */

test('authenticated flows complete without errors', async ({ page, target, context }) => {
  const flows = (target.flows ?? []).filter(f => f.auth);
  test.skip(flows.length === 0 || !target.auth, 'No authenticated flows configured');

  // Authenticate
  const cached = getCachedAuthState(target);
  if (cached) {
    const state = JSON.parse(fs.readFileSync(cached, 'utf-8'));
    await context.addCookies(state.cookies);
  } else {
    await authenticate(page, target);
    await saveAuthState(context, target);
  }

  for (const flow of flows) {
    await test.step(flow.name, async () => {
      const collector = new ConsoleErrorCollector(page, target.allowedErrors);

      for (const step of flow.steps) {
        await executeStep(page, step);
      }

      for (const selector of flow.expectSelectors ?? []) {
        await expect(
          page.locator(selector).first(),
          `Selector "${selector}" not visible after flow "${flow.name}"`,
        ).toBeVisible({ timeout: 10_000 });
      }

      if (flow.expectNoJsErrors !== false) {
        const errors = collector.getErrors();
        expect(
          errors,
          `JS errors in flow "${flow.name}":\n${errors.join('\n')}`,
        ).toHaveLength(0);
      }
    });
  }
});
