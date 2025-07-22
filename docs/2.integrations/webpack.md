---
title: "Webpack Integration"
icon: i-logos-webpack
description: "Add Lighthouse auditing to webpack-based projects with development server integration and HMR support."
navigation:
  title: "Webpack"
---

::warning
**Deprecated**: This integration will be removed in v1.0. We recommend using the [CLI](/integrations/cli) or [CI](/integrations/ci) integrations instead. [Learn more →](/integration-deprecations)
::

## Introduction

The webpack integration provides Lighthouse auditing capabilities for webpack-based applications during development.

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

```
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

You can either configure Unlighthouse via the plugin, or you can provide a [config file](/guide/guides/config)
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
