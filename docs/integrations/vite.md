# <span class="inline-flex items-center"><i-logos-vitejs class="mr-2 text-xl" /> Vite</span>

## Introduction

Using the Unlighthouse Vite plugin allows you to close the feedback loop in fixing your Google Lighthouse issues in your
development site.

### Features

<ul class="list-style-none mt-3 pl-0 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Hot Module Reloading will trigger re-scans</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> File open hints will be shown in the client</li>
<li class="flex items-center"><i-carbon-checkmark-outline class="text-green-500 mr-2" /><div>Automatic resolving of <a href="/glossary/#route-definition">route definitions</a><span class="opacity-85 italic"> (requires <a href="https://github.com/hannoeru/vite-plugin-pages">vite-plugin-pages</a>)</span></div></li>
</ul>

## Install

```bash
npm add -D @unlighthouse/vite
# yarn add -D @unlighthouse/vite
# pnpm add -D @unlighthouse/vite
```

## Usage

To begin using Unlighthouse, you'll need to add the plugin to `plugins`.

When you run your Vite app, it will give you the URL of client, only once you visit the client will Unlighthouse start.


```ts vite.config.ts
import Unlighthouse from '@unlighthouse/vite'

export default defineConfig({
  plugins: [
    Unlighthouse({
      // config
    })
  ]
})
```

### Providing Route Definitions

If you're using the [vite-plugin-pages](https://github.com/hannoeru/vite-plugin-pages) plugin, you can provide route definitions to Unlighthouse.

You will need to hook into the plugin using the following code.

```ts vite.config.ts
import { useUnlighthouse } from 'unlighthouse'

export default defineConfig({
  plugins: [
    Pages({
      // ...
      onRoutesGenerated(routes) {
        // tell Unlighthouse about the routes
        const unlighthouse = useUnlighthouse()
        if (unlighthouse?.hooks) {
          hooks.callHook('route-definitions-provided', routes)
        }
      }
    }),
  ]
})
```


## Configuration

You can either configure Unlighthouse via the plugin, or you can provide a `unlighthouse.config.ts` file
in the root directory.

See [Configuring Unlighthouse](/guide/config.html) for more information.


### Example

```js vite.config.ts
export default defineConfig({
  plugins: [
    Unlighthouse({
      scanner: {
        // simulate a desktop device
        device: 'desktop',
      }
    })
  ]
})
```
