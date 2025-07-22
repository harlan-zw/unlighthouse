---
title: Authentication
description: How to authenticate your site before scanning.
---

Unlighthouse is built to support scanning sites that require authentication.

## Basic Authentication

To use basic authentication, provide the `auth` option in your configuration file:

```ts
// unlighthouse.config.ts
export default {
  auth: {
    username: 'username',
    password: 'password',
  },
}
```

Alternatively, you can provide the `--auth` flag to the CLI.

```bash
unlighthouse --site <your-site> --auth username:password
```

## Cookie Authentication

If you can authenticate your session using cookies, use the `cookies` option in your configuration file:

```ts
// unlighthouse.config.ts
export default {
  cookies: [
    {
      name: 'my-jwt-token',
      value: '<token>',
      // optional extras
      domain: 'your-site.com',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ],
}
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
export default {
  extraHeaders: {
    'x-custom-auth': '<token>>',
  },
}
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
export default {
  defaultQueryParams: {
    auth: '<token>'
  }
}
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
export default {
  localStorage: {
    auth: '<token>'
  }
}
```

## Programmatic Usage

You can also use control Puppeteer programmatically before the page is scanned using a config file.
This is
more experimental, and you may run into issues.

You can see an example here:

```ts
// unlighthouse.config.ts
export default {
  hooks: {
    async authenticate(page) {
      // login to the page
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
}
```

## Persisting Authentication

If you need to persist your authentication data and it's not working as expected, you can configure Unlighthouse as follows:

```ts [unlighthouse.config.ts]
export default {
  // show the browser window
  puppeteerOptions: {
    userDataDir: './.puppeteer_data',
  },
  lighthouseOptions: {
    disableStorageReset: true,
    skipAboutBlank: true,
  },
}
```

## Troubleshooting

If you're having trouble authenticating,
you can use the `debug: true` and `headless: false`,
flags to see what's happening.

```ts [unlighthouse.config.ts]
export default {
  debug: true,
  // show the browser window
  puppeteerOptions: {
    headless: false,
    slowMo: 100,
  },
  // only run a single scan at a time
  puppeteerClusterOptions: {
    maxConcurrency: 1,
  },
}
```
