---
title: "Authentication for Lighthouse Scans"
description: "Scan password-protected websites with Unlighthouse. Configure basic auth, cookies, headers, localStorage, and programmatic login flows."
keywords:
  - lighthouse authentication
  - lighthouse password protected
  - lighthouse login
  - puppeteer authentication
  - lighthouse behind login
  - scan authenticated pages
navigation:
  title: "Authentication"
relatedPages:
  - path: /guide/guides/debugging
    title: Debugging
  - path: /guide/guides/puppeteer
    title: Puppeteer Configuration
  - path: /guide/guides/config
    title: Configuration
---

Need to scan pages behind a login? Unlighthouse supports every common auth pattern. Find yours below.

## Quick Reference

| Auth Type | Best For | Config Key |
|-----------|----------|------------|
| Basic Auth | Staging environments with HTTP basic auth | `auth` |
| Cookies | Session tokens, JWTs in cookies | `cookies` |
| Headers | Bearer tokens, API keys | `extraHeaders` |
| localStorage | SPAs storing tokens in localStorage | `localStorage` |
| Programmatic | Complex login flows, 2FA | `hooks.authenticate` |

## Basic Auth

For sites using HTTP Basic Authentication (the browser popup):

```ts
export default defineUnlighthouseConfig({
  auth: {
    username: process.env.AUTH_USER,
    password: process.env.AUTH_PASS,
  },
})
```

Or via CLI:
```bash
unlighthouse --site staging.example.com --auth admin:secretpass
```

## Cookies

Most common for session-based auth. Grab your session cookie from browser DevTools (Application → Cookies):

```ts
export default defineUnlighthouseConfig({
  cookies: [
    {
      name: 'session_id',
      value: 'abc123...',
      domain: 'example.com',  // Must match your site
      path: '/',
    },
  ],
})
```

**Getting the cookie value:**
1. Log into your site in Chrome
2. Open DevTools → Application → Cookies
3. Copy the session cookie value
4. Paste into config (or use environment variable)

CLI shorthand:
```bash
unlighthouse --site example.com --cookies "session_id=abc123"

# Multiple cookies
unlighthouse --site example.com --cookies "session_id=abc123;csrf_token=xyz789"
```

## Headers (Bearer Tokens, API Keys)

For APIs or sites expecting `Authorization` headers:

```ts
export default defineUnlighthouseConfig({
  extraHeaders: {
    'Authorization': `Bearer ${process.env.API_TOKEN}`,
  },
})
```

CLI:
```bash
unlighthouse --site api.example.com --extra-headers "Authorization:Bearer abc123"
```

## Query Params

Some staging environments use URL tokens:

```ts
export default defineUnlighthouseConfig({
  defaultQueryParams: {
    access_token: process.env.STAGING_TOKEN,
  },
})
```

Every scanned URL will include `?access_token=...`

## localStorage (SPAs)

For React/Vue/Angular apps storing auth tokens in localStorage:

```ts
export default defineUnlighthouseConfig({
  localStorage: {
    'auth_token': process.env.AUTH_TOKEN,
    'user_id': '12345',
  },
})
```

Unlighthouse sets these before each page loads.

## Programmatic Login (Complex Flows)

For login forms, OAuth flows, or anything the simpler methods can't handle:

```ts
export default defineUnlighthouseConfig({
  hooks: {
    async authenticate({ page }) {
      // Navigate to login
      await page.goto('https://example.com/login')

      // Fill form
      await page.type('input[name="email"]', 'test@example.com')
      await page.type('input[name="password"]', process.env.PASSWORD)

      // Submit and wait for redirect
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation(),
      ])
    },
  },
})
```

This runs once before scanning starts. The session persists for all pages.

## Auth Not Sticking?

If authentication isn't persisting between page scans:

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    userDataDir: './.unlighthouse-session',  // Persist browser data
  },
  lighthouseOptions: {
    disableStorageReset: true,   // Don't clear storage between pages
    skipAboutBlank: true,
  },
})
```

## Debugging Auth Issues

Can't tell if auth is working? Watch it happen:

```ts
export default defineUnlighthouseConfig({
  debug: true,
  puppeteerOptions: {
    headless: false,  // See the browser
    slowMo: 100,      // Slow it down
  },
  puppeteerClusterOptions: {
    maxConcurrency: 1,  // One at a time
  },
})
```

Now you can watch the browser and see exactly where auth fails.

See the [Debugging Guide](/guide/guides/debugging) for more techniques.
