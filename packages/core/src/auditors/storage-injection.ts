import type { IndexedDbSeedSpec } from '@unlighthouse/contracts'

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
      lines.push(`try { window.${store}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}) } catch (e) { /* best-effort storage seed */ }`)
    }
  }
  return lines.join('\n')
}

export type { IndexedDbSeedSpec }

/**
 * Build a script that seeds IndexedDB before the page's own scripts run (#216).
 * Best-effort: the caller's store schema (keyPath/autoIncrement) must match what
 * the page expects — IndexedDB is schema-bound, unlike key/value web storage.
 * Errors are swallowed per-record so a mismatch never aborts the audit.
 *
 * Pure: seed map in, JS source string out. Empty/absent → ''.
 */
export function buildIndexedDbInjectionScript(seed: Record<string, IndexedDbSeedSpec> | null | undefined): string {
  if (!seed || !Object.keys(seed).length)
    return ''
  // Embed the seed as JSON and replay it with the async IndexedDB API. Kept as a
  // self-contained IIFE so it runs standalone inside evaluateOnNewDocument.
  return `(function(){try{var seed=${JSON.stringify(seed)};Object.keys(seed).forEach(function(name){`
    + `var spec=seed[name];var open=indexedDB.open(name,spec.version||1);`
    + `open.onupgradeneeded=function(e){var db=e.target.result;Object.keys(spec.stores||{}).forEach(function(s){`
    + `if(!db.objectStoreNames.contains(s)){var o=spec.stores[s];db.createObjectStore(s,o.keyPath?{keyPath:o.keyPath}:(o.autoIncrement?{autoIncrement:true}:undefined));}});};`
    + `open.onsuccess=function(e){var db=e.target.result;var names=Object.keys(spec.stores||{});if(!names.length)return;`
    + `try{var tx=db.transaction(names,'readwrite');names.forEach(function(s){var recs=(spec.stores[s].records)||[];var os=tx.objectStore(s);`
    + `recs.forEach(function(r){try{os.put(r);}catch(_){/* best-effort record seed */}});});}catch(_){/* best-effort transaction seed */}};});}catch(_){/* best-effort indexedDB seed */}})();`
}
