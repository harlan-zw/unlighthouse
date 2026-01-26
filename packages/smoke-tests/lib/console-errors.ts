import type { Page, ConsoleMessage } from '@playwright/test';

/**
 * Patterns that are always ignored — third-party noise that is
 * never actionable for the product under test.
 */
const DEFAULT_ALLOWED_PATTERNS: string[] = [
  'google-analytics',
  'googletagmanager',
  'hotjar',
  'rollbar',
  'sentry',
  'favicon\\.ico',
  'ResizeObserver loop',
  'Non-Error promise rejection',
  'net::ERR_BLOCKED_BY_CLIENT',           // ad-blockers in headed mode
  'Failed to load resource.*analytics',
];

/**
 * Attaches to a Playwright `Page` and collects JS errors.
 *
 * Usage:
 *   const collector = new ConsoleErrorCollector(page, target.allowedErrors);
 *   await page.goto('/');
 *   expect(collector.getErrors()).toHaveLength(0);
 */
export class ConsoleErrorCollector {
  private errors: string[] = [];
  private readonly allowedPatterns: RegExp[];

  constructor(page: Page, extraAllowed?: string[]) {
    const raw = [...DEFAULT_ALLOWED_PATTERNS, ...(extraAllowed ?? [])];
    this.allowedPatterns = raw.map(p => new RegExp(p, 'i'));

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!this.isAllowed(text)) {
          this.errors.push(`[console.error] ${text}`);
        }
      }
    });

    page.on('pageerror', (error: Error) => {
      const text = error.message || String(error);
      if (!this.isAllowed(text)) {
        this.errors.push(`[pageerror] ${text}`);
      }
    });
  }

  private isAllowed(text: string): boolean {
    return this.allowedPatterns.some(re => re.test(text));
  }

  /** Return collected errors (snapshot — array is copied). */
  getErrors(): string[] {
    return [...this.errors];
  }

  /** Clear collected errors (useful between page navigations). */
  reset(): void {
    this.errors = [];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
