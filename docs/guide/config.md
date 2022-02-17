# Configuring Unlighthouse

## unlighthouse.config.ts

There are multiple ways to configure Unlighthouse, the easiest way is to use a `unlighthouse.config.ts` in your root
directory.

1. Load `unlighthouse.config.ts`
2. Pass `--config-file` option to the CLI or package, e.g. `unlighthouse --config ./path/to/unlighthouse.config.ts`

Alternatively configuration can be setup inline for whichever integration you've gone for.

```ts
/// <reference types="unlighthouse" />
import {defineConfig} from '@unlighthouse/core'

export default defineConfig({
  // example
  site: 'unlighthouse.dev',
  debug: true,
})
```

See the list of config options in the [Config Reference](/config/).
