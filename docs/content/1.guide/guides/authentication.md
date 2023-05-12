# Authentication

Unlighthouse is built to support scanning sites that require authentication. 

## Basic Authentication

To use basic authentication, provide the `auth` option in your configuration file:

```ts
// unlighthouse.config.ts
export default{
  auth: {
    username: 'username',
    password: 'password',
  },
};
```

Alternatively, you can provide the `--auth` flag to the CLI.

```bash
unlighthouse --site <your-site> --auth username:password
```

## Cookies

To use cookies, provide the `cookies` option in your configuration file:

```ts
// unlighthouse.config.ts
export default{
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
};
```

Alternatively, you can provide the `--cookies` flag to the CLI.

```bash
unlighthouse --site <your-site> --cookies "my-jwt-token=<token>"
```

You can provide multiple cookies by separating them with a `;`.

```bash
unlighthouse --site <your-site> --cookies my-jwt-token=<token>;my-other-cookie=value
```

## Custom Headers

If providing cookies or basic auth is not enough, you can provide custom headers to be sent with each request.

To use custom headers, provide the `extraHeaders` option in your configuration file:

```ts
// unlighthouse.config.ts
export default{
  extraHeaders: {
    'x-custom-auth': '<token>>',
  },
};
```

Alternatively, you can provide the `--extra-headers` flag to the CLI.

```bash
unlighthouse --site <your-site> --extra-headers x-custom-header:custom-value
```

You can provide multiple headers by separating them with a `,`.

```bash
unlighthouse --site <your-site> --extra-headers x-custom-header:custom-value,x-other-header:other-value
```
