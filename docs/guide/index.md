# Getting Started

<DevelopmentWarning/>

## Overview

Unlighthouse is universal site auditing powered by Lighthouse.

## Trying Unlighthouse Online

You can try Unlighthouse online on [StackBlitz](https://unlighthouse.dev/new). It runs Unlighthouse directly in the browser, and it is almost identical to the local setup but doesn't require installing anything on your machine.

## Adding Unlighthouse to your Project

```bash
// with npm
$ npm install -D unlighthouse

// or with yarn
$ yarn add -D unlighthouse

// or with pnpm
$ pnpm add -D unlighthouse
```

:::tip
Unlighthouse requires Vite >=v2.7.10 and Node >=v14
:::

## Configuring Unlighthouse

One of the main advantages of Unlighthouse is its unified configuration with Vite. If present, `unlighthouse` will read your root `vite.config.ts` to match with the plugins and setup as your Vite app. For example, your Vite [resolve.alias](https://vitejs.dev/config/#resolve-alias) and [plugins](https://vitejs.dev/guide/using-plugins.html) configuration will work out-of-the-box. If you want a different configuration during testing, you can:

- Create `unlighthouse.config.ts`, which will have the higher priority
- Pass `--config` option to CLI, e.g. `unlighthouse --config ./path/to/unlighthouse.config.ts`
- Use `process.env.UNLIGHTHOUSE` to conditionally apply different configuration in `vite.config.ts`

To configure `unlighthouse` itself, add `test` property in your Vite config. You'll also need to add a reference to Unlighthouse types using a [triple slash command](https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html#-reference-types-) at the top of your config file.

```ts
/// <reference types="unlighthouse" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    // ...
  },
})
```

See the list of config options in the [Config Reference](../config/)

## Command Line Interface

In a project where Unlighthouse is installed, you can use the `unlighthouse` binary in your npm scripts, or run it directly with `npx unlighthouse`. Here are the default npm scripts in a scaffolded Unlighthouse project:

<!-- prettier-ignore -->
```json5
{
  "scripts": {
    "test": "unlighthouse",
    "coverage": "unlighthouse --coverage"
  }
}
```

To run tests once without watching for file changes, use `unlighthouse run`.
You can specify additional CLI options like `--port` or `--https`. For a full list of CLI options, run `npx unlighthouse --help` in your project.

### CLI Commands

### `unlighthouse watch`

Run all test suites but watch for changes and rerun tests when they change. Same as calling `unlighthouse` without a command. In CI environments this command will fallback to `unlighthouse run`

### `unlighthouse run`

Perform a single run without watch mode.

### `unlighthouse dev`

Run unlighthouse in development mode.

### `unlighthouse related`

Run only tests that cover a list of source files. Works with static lazy imports, but not the dynamic ones. All files should be relative to root folder.

Useful to run with [`lint-staged`](https://github.com/okonet/lint-staged) or with your CI setup.

```bash
unlighthouse related /src/index.ts /src/hello-world.js
```

### CLI Options

| Options       |               |
| ------------- | ------------- |
| `-v, --version` | Display version number |
| `-r, --root <path>` | Define the project root |
| `-c, --config <path>` | Path to config file |
| `-u, --update` | Update snapshots |
| `-w, --watch` | Watch mode |
| `-t, --testNamePattern <pattern>` | Run tests with names matching the pattern |
| `--ui` | Open UI |
| `--api [api]` | Serve API, available options: `--api.port <port>`, `--api.host [host]` and `--api.strictPort` |
| `--threads` | Enable Threads (default: true) |
| `--silent` | Silent console output from tests |
| `--reporter <name>` | Select reporter: `default`, `verbose`, or `dot` |
| `--coverage` | Use c8 for coverage |
| `--run` | Do not watch |
| `--global` | Inject APIs globally |
| `--dom` | Mock browser api with happy-dom |
| `--environment <env>` | Runner environment (default: node) |
| `--passWithNoTests` | Pass when no tests found |
| `-h, --help` | Display available CLI options |

## Examples

- [Unit Testing](https://github.com/unlighthouse-dev/unlighthouse/tree/main/test/core)
- [Vue Component Testing](https://github.com/unlighthouse-dev/unlighthouse/tree/main/examples/vue)
- [React Component Testing](https://github.com/unlighthouse-dev/unlighthouse/tree/main/examples/react)
- [Svelte Component Testing](https://github.com/unlighthouse-dev/unlighthouse/tree/main/examples/svelte)
- [Lit Component Testing](https://github.com/unlighthouse-dev/unlighthouse/tree/main/examples/lit)
- [Vitesse Component Testing](https://github.com/unlighthouse-dev/unlighthouse/tree/main/examples/vitesse)
- [All examples](https://github.com/unlighthouse-dev/unlighthouse/tree/main/examples)

## Projects using Unlighthouse

- [unocss](https://github.com/antfu/unocss)
- [unplugin-auto-import](https://github.com/antfu/unplugin-auto-import)
- [unplugin-vue-components](https://github.com/antfu/unplugin-vue-components)
- [vitesse](https://github.com/antfu/vitesse)
- [vitesse-lite](https://github.com/antfu/vitesse-lite)
- [fluent-vue](https://github.com/demivan/fluent-vue)
- [vueuse](https://github.com/vueuse/vueuse)
- [milkdown](https://github.com/Saul-Mirone/milkdown)

## Using Unreleased Commits

If you can't wait for a new release to test the latest features, you will need to clone the [unlighthouse repo](https://github.com/unlighthouse-dev/unlighthouse) to your local machine and then build and link it yourself ([pnpm](https://pnpm.io/) is required):

```bash
git clone https://github.com/unlighthouse-dev/unlighthouse.git
cd unlighthouse
pnpm install
cd packages/unlighthouse
pnpm run build
pnpm link --global # you can use your preferred package manager for this step
```

Then go to the project where you are using Unlighthouse and run `pnpm link --global unlighthouse` (or the package manager that you used to link `unlighthouse` globally).

## Community

If you have questions or need help, reach out to the community at [Discord](https://chat.unlighthouse.dev) and [GitHub Discussions](https://github.com/unlighthouse-dev/unlighthouse/discussions).
