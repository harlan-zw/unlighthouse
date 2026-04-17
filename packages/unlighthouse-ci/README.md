# unlighthouse-ci

Dedicated CI package for [Unlighthouse](https://github.com/harlan-zw/unlighthouse) that provides continuous integration capabilities with budget enforcement and exit codes.

## Installation

```bash
# Use directly with npx
npx unlighthouse-ci --site https://example.com

# Or install globally
npm install -g unlighthouse-ci
```

## Usage

### Basic CI Scanning

```bash
# Run CI scan with default budget (75)
unlighthouse-ci --site https://example.com

# Custom performance budget
unlighthouse-ci --site https://example.com --budget 85

# Desktop scanning with custom output
unlighthouse-ci --site https://example.com --desktop --output-path ./lighthouse-reports
```

### GitHub Actions Integration

```yaml
name: Lighthouse CI
on: [push, pull_request]
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Lighthouse CI
        run: npx unlighthouse-ci --site ${{ secrets.SITE_URL }} --budget 80
```

### Features

- Performance budget enforcement with configurable thresholds
- Exit codes for CI/CD pipeline integration
- Static report generation for hosting
- Comprehensive logging and debugging
- Support for custom Lighthouse configurations

## Configuration

Create `unlighthouse.config.ts` for advanced CI configuration:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  ci: {
    budget: 80,
    buildStatic: true,
  },
  lighthouseOptions: {
    onlyCategories: ['performance', 'accessibility', 'seo'],
  }
})
```

## Documentation

- [CI Integration Guide](https://unlighthouse.dev/integrations/ci.html)
- [GitHub Actions Example](https://unlighthouse.dev/integrations/ci.html#github-actions)
- [Configuration Reference](https://unlighthouse.dev/guide/config.html)

## License

MIT License © 2021-PRESENT [Harlan Wilton](https://github.com/harlan-zw)
