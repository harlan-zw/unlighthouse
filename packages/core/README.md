# @unlighthouse/core

The core engine of [Unlighthouse](https://github.com/harlan-zw/unlighthouse) that handles website scanning, Lighthouse execution, and report generation.

## Usage

### Basic Usage

```ts
import { createUnlighthouse } from '@unlighthouse/core'

const unlighthouse = await createUnlighthouse({
  site: 'https://example.com',
  debug: true,
  scanner: {
    device: 'desktop',
  }
})

await unlighthouse.start()
```

### With Custom Provider

```ts
import { createUnlighthouse } from '@unlighthouse/core'

const unlighthouse = await createUnlighthouse(
  { /* user config */ },
  {
    name: 'custom',
    routeDefinitions: () => generateRouteDefinitions(),
  }
)
```

### Hooks

```ts
import { useUnlighthouse } from '@unlighthouse/core'

const { hooks } = useUnlighthouse()

hooks.hook('task-complete', (path, response) => {
  console.log('Task completed for:', path)
})
```

## API

- `createUnlighthouse(userConfig, provider?)` - Initialize Unlighthouse
- `useUnlighthouse()` - Access the global Unlighthouse context
- `generateClient(options)` - Generate static client files

## Documentation

- [API Reference](https://unlighthouse.dev/api/index.html)
- [Configuration Guide](https://unlighthouse.dev/guide/config.html)
- [Puppeteer Configuration](https://unlighthouse.dev/guide/puppeteer.html)

## License

MIT License © 2021-PRESENT [Harlan Wilton](https://github.com/harlan-zw)
