---
title: Webpack
icon: logos:webpack
description: Using the Unlighthouse webpack plugin allows you to close the feedback loop in fixing your Google Lighthouse issues in your development site.
---

# Webpack

::alert{type="warning"}
This integration is now deprecated and will be removed in the v1 major release.
Read more about [integration deprecations](/integration-deprecations).
::

Using the Unlighthouse webpack plugin allows you to close the feedback loop in fixing your Google Lighthouse issues in
your development site.


## Install

::code-group

```bash [yarn]
yarn add -D @unlighthouse/webpack
```

```bash [npm]
npm install -D @unlighthouse/webpack
```

```bash [pnpm]
pnpm add -D @unlighthouse/webpack
```

::

### Git ignore reports

Unlighthouse will save your reports in `outputDir` (`.unlighthouse` by default),
it's recommended you .gitignore these files.

```gitignore .gitignore
.unlighthouse
```

## Usage

To begin using Unlighthouse, you'll need to add extend your webpack configuration.

When you run your webpack app, it will give you the URL of client, only once you visit the client will Unlighthouse
start.

### webpack.config.js example

```js webpack.config.js
import Unlighthouse from '@unlighthouse/webpack'

export default {
  // ...
  plugins: [
    Unlighthouse({
      // config
    }),
  ],
}
```

### CJS example

```js webpack.config.js
const Unlighthouse = require('@unlighthouse/webpack')

export default {
  // ...
  plugins: [
    Unlighthouse({
      // config
    }),
  ],
}
```

## Configuration

You can either configure Unlighthouse via the plugin, or you can provide a [config file](/guide/config/file)
in the root directory.

### Example

```js webpack.config.ts
import Unlighthouse from '@unlighthouse/webpack'

export default {
  // ...
  plugins: [
    Unlighthouse({
      scanner: {
        // simulate a desktop device
        device: 'desktop',
      }
    }),
  ],
}
```
