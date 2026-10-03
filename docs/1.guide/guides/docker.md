---
title: "Docker"
description: "Docker for the Unlighthouse v1 beta."
navigation:
  title: "Docker"
relatedPages:
  - path: /integrations/ci
    title: CI Integration
  - path: /guide/guides/puppeteer
    title: Chrome Options
  - path: /guide/guides/chrome-dependency
    title: Chrome Dependency
---

Use a container with Node.js 24.13.1 or newer and Chrome installed.
Install `unlighthouse@beta` alongside your project dependencies.

## Run the CI executable

```sh
CHROME_PATH=/usr/bin/google-chrome CHROME_FLAGS="--no-sandbox --disable-setuid-sandbox" pnpm exec unlighthouse-ci --site http://app:3000 --reporter json
```

The browser executable must exist at `CHROME_PATH` inside the container.
Mount a writable output directory when you need exports after the container exits.
Set the site hostname to an address reachable from that container.

## Authentication

Pass required credentials through container environment variables.
Use [Authentication](/guide/guides/authentication) for supported audit headers and storage seeding.
Puppeteer launch options and login page hooks do not configure the v1 runtime.
