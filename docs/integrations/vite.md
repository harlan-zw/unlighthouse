# Vite

<sponsor-banner />

## Setup

```bash
# NPM
npm add -D @unlighthouse/vite
# or Yarn
yarn add -D @unlighthouse/vite
# or PNPM
pnpm add -D @unlighthouse/vite
```

Within your `vite.config.ts` add the following:

```ts
// ...
import Unlighthouse from '@unlighthouse/vite'
import { useUnlighthouse } from "unlighthouse";

export default defineConfig({
  // ...
  plugins: [
      // pages plugin
    Pages({
      extensions: ['vue', 'md'],
      onRoutesGenerated(routes) {
        // tell unlighthouse about the route definitions
        const unlighthouse = useUnlighthouse()
        if (unlighthouse?.hooks) {
            hooks.callHook('route-definitions-provided', routes)
        }
      }
    }),
    // ...
    Unlighthouse({
      // config
    })
  ]
})
```
