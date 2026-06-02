/**
 * Build a script that seeds `localStorage` / `sessionStorage` before the page's
 * own scripts run. Injected via puppeteer `page.evaluateOnNewDocument`, so it runs
 * on every navigation (and redirect) ahead of the site's JS — the standard way to
 * pre-authenticate a page that gates on web storage (e.g. a JWT in sessionStorage).
 *
 * Pure: storage records in, JS source string out. Absent/empty records → ''.
 */
export function buildStorageInjectionScript(opts: {
  localStorage?: Record<string, unknown> | null
  sessionStorage?: Record<string, unknown> | null
}): string {
  const stores: Array<['localStorage' | 'sessionStorage', Record<string, unknown> | null | undefined]> = [
    ['localStorage', opts.localStorage],
    ['sessionStorage', opts.sessionStorage],
  ]
  const lines: string[] = []
  for (const [store, data] of stores) {
    if (!data)
      continue
    for (const [key, raw] of Object.entries(data)) {
      // Strings pass through; everything else is JSON-encoded (web storage only
      // holds strings). JSON.stringify on both key and value escapes safely.
      const value = typeof raw === 'string' ? raw : JSON.stringify(raw)
      lines.push(`try { window.${store}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}) } catch (e) {}`)
    }
  }
  return lines.join('\n')
}
