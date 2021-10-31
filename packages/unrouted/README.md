[![d](https://img.shields.io/npm/dm/h3.svg?style=flat-square)](https://npmjs.com/package/h3)
[![v](https://img.shields.io/npm/v/h3/latest.svg?style=flat-square)](https://npmjs.com/package/h3)
[![b](https://img.shields.io/bundlephobia/min/h3/latest.svg?style=flat-square)](https://bundlephobia.com/result?p=h3)
[![a](https://img.shields.io/github/workflow/status/unjs/h3/ci/main?style=flat-square)](https://github.com/unjs/h3/actions)
[![c](https://img.shields.io/codecov/c/gh/unjs/h3/main?style=flat-square)](https://codecov.io/gh/unjs/h3)

> Unrouted is a fluent, expressive router built for developer experience and compatibility

<!-- ![h3 - Tiny JavaScript Server](.github/banner.svg) -->

**Features**

✔️ **Compatibility:** Works with Express, Connect, H3 and Koa 

✔️ **Developer Experience:** 

- Named URL parameters
- Grouping with prefix
- Responds to OPTIONS requests with allowed methods.
- Support for 405 Method Not Allowed and 501 Not Implemented.

✔️ **Minimal:** Modular plugin design for better tree-shaking and minimal dependencies

✔️ **Modern:** TypeScript and Native promise support

## Install

```bash
# Using npm
npm install unrouted

# Using yarn
yarn add unrouted
```

## Usage

```ts
import { createServer } from 'http'
import { createApp } from 'h3'

const app = createApp()
const router = createRouter()

router.get('/', 'Hello World')
router.provide(app)

createServer(app).listen(process.env.PORT || 3000)
```

## Examples

```js
// Handle can directly return object or Promise<object> for JSON response
app.use('/api', (req) => ({ url: req.url }))

// We can have better matching other than quick prefix match
app.use('/odd', () => 'Is odd!', { match: url => url.substr(1) % 2 })

// Handle can directly return string for HTML response
app.use(() => '<h1>Hello world!</h1>')

// We can chain calls to .use()
app.use('/1', () => '<h1>Hello world!</h1>')
   .use('/2', () => '<h1>Goodbye!</h1>')

// Legacy middleware with 3rd argument are automatically promisified
app.use((req, res, next) => { req.setHeader('X-Foo', 'bar'); next() })

// Force promisify a legacy middleware
// app.use(someMiddleware, { promisify: true })

// Lazy loaded routes using { lazy: true }
// app.use('/big', () => import('./big'), { lazy: true })
```

## Utilities

Instead of adding helpers to `req` and `res`, h3 exposes them as composable utilities.

- `useRawBody(req, encoding?)`
- `useBody(req)`
- `useCookies(req)`
- `useCookie(req, name)`
- `setCookie(req, name, value, opts?)`
- `useQuery(req)`
- `send(res, data, type?)`
- `sendRedirect(res, location, code=302)`
- `appendHeader(res, name, value)`
- `createError({ statusCode, statusMessage, data? }`
- `sendError(res, error, debug?)`

## How it works?

Using `createApp`, it returns a standard `(req, res)` handler function and internally an array called middleware stack. using`use()` method we can to add an item to this internal stack.

When a request comes, each stack item that matches the route will be called and resolved until [`res.writableEnded`](https://nodejs.org/api/http.html#http_response_writableended) flag is set, which means the response is sent. If `writableEnded` is not set after all middleware, a `404` error will be thrown. And if one of the stack items resolves to a value, it will be serialized and sent as response as a shorthand method to sending responses.

For maximum compatibility with connect/express middleware (`req, res, next?` signature), h3 converts classic middleware into a promisified version ready to use with stack runner:

- If middleware has 3rd next/callback param, promise will `resolve/reject` when called
- If middleware returns a promise, it will be **chained** to the main promise
- If calling middleware throws an immediate error, promise will be rejected
- On `close` and `error` events of res, promise will `resolve/reject` (to ensure if middleware simply calls `res.end`)

## License

MIT
