# unlighthouse

The main package for [Unlighthouse](https://github.com/harlan-zw/unlighthouse) - scan your entire website with Google Lighthouse. This is a convenience package that includes the core functionality and CLI tools.

## Quick Start

```bash
# Scan your website instantly
npx unlighthouse --site https://example.com

# CI mode with performance budgets
npx unlighthouse-ci --site https://example.com --budget 80
```

## What's Included

This package includes:
- `unlighthouse` - Core scanning engine
- `@unlighthouse/cli` - Command-line interface
- `@unlighthouse/client` - Web interface for results
- Two binaries: `unlighthouse` and `unlighthouse-ci`

## Installation

```bash
# Global installation
npm install -g unlighthouse

# Project dependency
npm install unlighthouse --save-dev
```

## Usage

### Interactive CLI

```bash
# Basic scan
unlighthouse --site https://example.com

# With debugging and custom device
unlighthouse --site https://example.com --debug --desktop

# Custom configuration
unlighthouse --config-file unlighthouse.config.ts
```

### Programmatic Usage

```ts
import { createUnlighthouse } from 'unlighthouse'

const unlighthouse = await createUnlighthouse({
  site: 'https://example.com',
  debug: true
})

await unlighthouse.start()
```

### CI Integration

```bash
# Enforce performance budgets in CI
unlighthouse-ci --site https://example.com --budget 85
```

## Configuration

Create `unlighthouse.config.ts`:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  scanner: {
    device: 'desktop',
    throttle: false,
  },
  lighthouseOptions: {
    onlyCategories: ['performance', 'accessibility'],
  }
})
```

## Documentation

- [Getting Started Guide](https://unlighthouse.dev/guide/)
- [CLI Integration](https://unlighthouse.dev/integrations/cli.html)
- [CI Integration](https://unlighthouse.dev/integrations/ci.html)
- [API Reference](https://unlighthouse.dev/api/)
- [Configuration Reference](https://unlighthouse.dev/guide/config.html)

## License

MIT License © 2021-PRESENT [Harlan Wilton](https://github.com/harlan-zw)
