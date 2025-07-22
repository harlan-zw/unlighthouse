---
title: "Authentication"
description: "Configure authentication for scanning protected websites using basic auth, cookies, headers, or custom methods."
navigation:
  title: "Authentication"
---

## Introduction

Unlighthouse provides multiple authentication methods to scan protected websites. Whether you need basic authentication, session cookies, custom headers, or programmatic login flows, Unlighthouse adapts to your authentication requirements.

## Basic Authentication

To use basic authentication, provide the `auth` option in your configuration file:

```ts
// unlighthouse.config.ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  auth: {
    username: 'username',
    password: 'password',
  },
})
```

Alternatively, you can provide the `--auth` flag to the CLI.

```bash
unlighthouse --site <your-site> --auth username:password
```

## Cookie Authentication

If you can authenticate your session using cookies, use the `cookies` option in your configuration file:

```ts
// unlighthouse.config.ts
export default defineUnlighthouseConfig({
  cookies: [
    {
      name: 'my-jwt-token',
      value: '<token>',
      domain: 'your-site.com',
      path: '/',
    },
  ],
})
```

Alternatively, you can provide the `--cookies` flag to the CLI.

```bash
unlighthouse --site <your-site> --cookies "my-jwt-token=<token>"
```

You can provide multiple cookies by separating them with a `;`.

```bash
unlighthouse --site <your-site> --cookies my-jwt-token=<token>;my-other-cookie=value
```

## Custom Headers Authentication

If providing cookies or basic auth is not enough, you can provide custom headers to be sent with each request.

To use custom headers, provide the `extraHeaders` option in your configuration file:

```ts
// unlighthouse.config.ts
export default defineUnlighthouseConfig({
  extraHeaders: {
    'x-custom-auth': '<token>',
  },
})
```

Alternatively, you can provide the `--extra-headers` flag to the CLI.

```bash
unlighthouse --site <your-site> --extra-headers x-custom-header:custom-value
```

You can provide multiple headers by separating them with a `,`.

```bash
unlighthouse --site <your-site> --extra-headers x-custom-header:custom-value,x-other-header:other-value
```

## Query Params

If you can configure your authentication using query params,
then you can provide them using the `defaultQueryParams` option in your configuration file:

```ts
// unlighthouse.config.ts
export default defineUnlighthouseConfig({
  defaultQueryParams: {
    auth: '<token>'
  },
})
```

Alternatively, you can provide the `--default-query-params` flag to the CLI.

```bash
unlighthouse --site <your-site> --default-query-params auth=<token>,foo=bar
```

## Local Storage

If you can configure your authentication using local storage,
then you can provide them using the `localStorage` option in your configuration file:

```ts
// unlighthouse.config.ts
export default defineUnlighthouseConfig({
  localStorage: {
    auth: '<token>'
  },
})
```

## Programmatic Usage

You can also use control Puppeteer programmatically before the page is scanned using a config file.
This is
more experimental, and you may run into issues.

You can see an example here:

```ts
// unlighthouse.config.ts
export default defineUnlighthouseConfig({
  hooks: {
    async authenticate(page) {
      await page.goto('https://example.com/login')
      const emailInput = await page.$('input[type="email"]')
      await emailInput.type('admin@example.com')
      const passwordInput = await page.$('input[type="password"]')
      await passwordInput.type('password')
      await Promise.all([
        page.$eval('.login-form', form => form.submit()),
        page.waitForNavigation(),
      ])
    },
  },
})
```

## Persisting Authentication

If you need to persist your authentication data and it's not working as expected, you can configure Unlighthouse as follows:

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    userDataDir: './.puppeteer_data',
  },
  lighthouseOptions: {
    disableStorageReset: true,
    skipAboutBlank: true,
  },
})
```

::tip
For debugging authentication issues, enable visual mode and debug logging as described in the [Debugging Guide](/guide/guides/debugging).
::
