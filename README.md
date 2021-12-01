# unlighthouse

[![NPM version](https://img.shields.io/npm/v/unlighthouse?color=a1b858&label=)](https://www.npmjs.com/package/unlighthouse)

Starter template for [unplugin](https://github.com/unjs/unplugin).

## Install

```bash
npm i unlighthouse
```

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import Starter from 'unlighthouse/vite'

export default defineConfig({
  plugins: [
    Starter({ /* options */ }),
  ],
})
```

Example: [`playground/`](./playground/)

<br></details>

<details>
<summary>Rollup</summary><br>

```ts
// rollup.config.js
import Starter from 'unlighthouse/rollup'

export default {
  plugins: [
    Starter({ /* options */ }),
  ],
}
```

<br></details>


<details>
<summary>Webpack</summary><br>

```ts
// webpack.config.js
module.exports = {
  /* ... */
  plugins: [
    require('unlighthouse/webpack')({ /* options */ })
  ]
}
```

<br></details>

<details>
<summary>Nuxt</summary><br>

```ts
// nuxt.config.js
export default {
  buildModules: [
    ['unlighthouse/nuxt', { /* options */ }],
  ],
}
```

> This module works for both Nuxt 2 and [Nuxt Vite](https://github.com/nuxt/vite)

<br></details>

<details>
<summary>Vue CLI</summary><br>

```ts
// vue.config.js
module.exports = {
  configureWebpack: {
    plugins: [
      require('unlighthouse/webpack')({ /* options */ }),
    ],
  },
}
```

<br></details>
