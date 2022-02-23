# <span class="inline-flex items-center"><i-logos-nuxt-icon class="mr-2 text-xl" /> Nuxt.js</span>

## Introduction

Using the Unlighthouse Nuxt.js module allows you to close the feedback loop in fixing your Google Lighthouse issues in your 
development site.

### Features

<ul class="list-style-none mt-3 pl-0 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Hot Module Reloading will trigger re-scans</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> File open hints will be shown in the client</li>
<li class="flex items-center"><i-carbon-checkmark-outline class="text-green-500 mr-2" /><div>Automatic resolving of <a href="/glossary/#route-definition">route definitions</a></div></li>
</ul>

## Install

<sponsor-banner />

```bash
npm add -D @unlighthouse/nuxt
# yarn add -D @unlighthouse/nuxt
# pnpm add -D @unlighthouse/nuxt
```

### Git ignore reports

Unlighthouse will save your reports in `outputDir` (`.unlighthouse` by default),
it's recommended you .gitignore these files.

```gitignore .gitignore
.unlighthouse
```

## Usage

To begin using Unlighthouse, you'll need to add the module to `buildModules`. 

When you run your Nuxt app, it will give you the URL of client, only once you visit the client will Unlighthouse start.

### Nuxt 3

```js nuxt.config.ts
import { defineNuxtConfig } from 'nuxt3'

export default defineNuxtConfig({
  buildModules: [
    '@unlighthouse/nuxt',
  ],
})
```

### Nuxt 2

```js nuxt.config.js
export default {
  buildModules: [
    '@unlighthouse/nuxt',
  ],
}
```

Type support can be added by adding the `@unlighthouse/nuxt` module to your `plugins`. Nuxt v3 will automatically add type support.

```json tsconfig.json
{
  "compilerOptions": {
    "types": [
      "@unlighthouse/nuxt"
    ]
  }
}
```

## Configuration

You can either configure Unlighthouse via the `unlighthouse` key in your Nuxt config, or you can provide a `unlighthouse.config.ts` file
in the root directory.

See [Configuring Unlighthouse](/guide/config.html) for more information.


### Example

```js nuxt.config.js
export default {
  unlighthouse: {
    scanner: {
      // simulate a desktop device
      device: 'desktop',
    }
  }
}
```
