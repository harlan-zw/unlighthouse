import type { Page, BrowserContext } from '@playwright/test';
import type { AuthConfig, ProductTarget } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_STATE_DIR = path.join(__dirname, '..', 'auth-state');
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/* ------------------------------------------------------------------ */
/*  Env-var resolution                                                */
/* ------------------------------------------------------------------ */

/**
 * Resolve a value that may reference an env var via "${VAR_NAME}" syntax.
 * Plain strings are returned as-is.
 */
export function resolveEnvValue(value: string): string {
  const match = value.match(/^\$\{(.+)\}$/);
  if (match) {
    const envVal = process.env[match[1]];
    if (!envVal) {
      throw new Error(`Environment variable ${match[1]} is not set`);
    }
    return envVal;
  }
  return value;
}

/* ------------------------------------------------------------------ */
/*  Auth-state persistence                                            */
/* ------------------------------------------------------------------ */

function getStatePath(targetName: string): string {
  return path.join(AUTH_STATE_DIR, `${targetName}.json`);
}

function isStateFresh(targetName: string, maxAge: number): boolean {
  const statePath = getStatePath(targetName);
  if (!fs.existsSync(statePath)) return false;
  const stat = fs.statSync(statePath);
  return Date.now() - stat.mtimeMs < maxAge;
}

/**
 * Returns the path to a cached auth-state file if it exists and is
 * still fresh. Otherwise returns `undefined`.
 */
export function getCachedAuthState(target: ProductTarget): string | undefined {
  if (!target.auth) return undefined;
  const maxAge = target.auth.maxAge ?? DEFAULT_MAX_AGE;
  if (isStateFresh(target.name, maxAge)) {
    return getStatePath(target.name);
  }
  return undefined;
}

/**
 * Save the browser context's storage state so future runs skip login.
 */
export async function saveAuthState(
  context: BrowserContext,
  target: ProductTarget,
): Promise<string> {
  if (!fs.existsSync(AUTH_STATE_DIR)) {
    fs.mkdirSync(AUTH_STATE_DIR, { recursive: true });
  }
  const statePath = getStatePath(target.name);
  await context.storageState({ path: statePath });
  return statePath;
}

/* ------------------------------------------------------------------ */
/*  Login strategies                                                  */
/* ------------------------------------------------------------------ */

/**
 * Run the configured login flow on the given page.
 * After this resolves the page (and its context) will be authenticated.
 */
export async function authenticate(
  page: Page,
  target: ProductTarget,
): Promise<void> {
  const auth = target.auth;
  if (!auth) return;

  switch (auth.strategy) {
    case 'form':
      await formLogin(page, auth);
      break;
    case 'cookie':
      await cookieLogin(page, target);
      break;
    case 'bearer':
      // Bearer tokens are injected at the request level, not via page login.
      // Use `page.route()` or `context.setExtraHTTPHeaders()` upstream.
      break;
    case 'basic':
      // Basic auth is set via `context.setHTTPCredentials()` upstream.
      break;
  }
}

async function formLogin(page: Page, auth: AuthConfig): Promise<void> {
  if (!auth.loginUrl || !auth.fields || !auth.submitSelector) {
    throw new Error('Form auth requires loginUrl, fields, and submitSelector');
  }

  await page.goto(auth.loginUrl);

  for (const [selector, envRef] of Object.entries(auth.fields)) {
    const value = resolveEnvValue(envRef);
    await page.locator(selector).fill(value);
  }

  await page.locator(auth.submitSelector).click();

  if (auth.successIndicator) {
    if (auth.successIndicator.startsWith('/')) {
      await page.waitForURL(`**${auth.successIndicator}*`, { timeout: 15_000 });
    } else {
      await page.locator(auth.successIndicator).waitFor({ state: 'visible', timeout: 15_000 });
    }
  }
}

async function cookieLogin(page: Page, target: ProductTarget): Promise<void> {
  const auth = target.auth!;
  if (!auth.cookieName || !auth.cookieValue) {
    throw new Error('Cookie auth requires cookieName and cookieValue');
  }

  const url = new URL(target.baseUrl);
  await page.context().addCookies([{
    name: auth.cookieName,
    value: resolveEnvValue(auth.cookieValue),
    domain: url.hostname,
    path: '/',
  }]);
}
