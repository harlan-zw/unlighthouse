---
title: Docker and GitHub CI
description: Using Unlighthouse in a Docker container is a great way to run it in a predictable CI environment.
---

Support is experimental and provided by the community. An official docker image may be created in the future.

It requires special configuration to the puppeteer instance. The [running puppeteer in docker](https://pptr.dev/troubleshooting/#running-puppeteer-in-docker) article is a great read.

## Unlighthouse Config

It's recommended you only use the `@unlighthouse/ci` with Docker. Hosting the client does not have known support.

You will need to remove the Chrome sandbox in a Docker environment, this will require using an `unlighthouse.config.ts` file.

```ts
// unlighthouse.config.ts
export default {
  puppeteerOptions: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
}
```

If you're using the `unlighthouse` binary instead of the CI integration, then you will need to tell Unlighthouse not to use the server and close when
the reports are finished.

```ts
// unlighthouse.config.ts
export default {
  server: {
    open: false,
  },
  hooks: {
    'worker-finished': async () => {
      process.exit(0)
    }
  }
}
```

## Docker File

Please see the following community repos:
- [indykoning—Unlighthouse Docker](https://github.com/indykoning/unlighthouse-docker)
