# <span class="inline-flex items-center"><i-logos-webpack class="mr-2 text-xl" /> webpack</span>

## Introduction

Using the Unlighthouse webpack plugin allows you to close the feedback loop in fixing your Google Lighthouse issues in
your development site.

### Features

<ul class="list-style-none mt-3 pl-0 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Hot Module Reloading will trigger re-scans</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> File open hints will be shown in the client</li>
<li class="flex items-center"><i-carbon-checkmark-outline class="text-green-500 mr-2" /><div>Automatic resolving of <a href="/glossary/#route-definition">route definitions</a><span class="opacity-85 italic"> (requires <a href="/guide/route-definitions.html">manual discovery</a>)</span></div></li>
</ul>

## Install

```bash
npm add -D @unlighthouse/webpack
# yarn add -D @unlighthouse/webpack
# pnpm add -D @unlighthouse/webpack
```

### Git ignore reports

Unlighthouse will save your reports in `outputDir` (`.lighthouse` by default),
it's recommended you .gitignore these files.

```gitignore .gitignore
.lighthouse
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

You can either configure Unlighthouse via the plugin, or you can provide a `unlighthouse.config.ts` file
in the root directory.

See [Configuring Unlighthouse](/guide/config.html) for more information.

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
