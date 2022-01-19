![unlighthouse - Delightfully navigate your sites performance, accessibility and seo.](https://repository-images.githubusercontent.com/423079536/995fb12f-5cd8-4486-8967-f71fa958b2cb)
<p align="center">
<a href="https://www.npmjs.com/package/@unlighthouse/core" target="__blank"><img src="https://img.shields.io/npm/v/@unlighthouse/core?color=2B90B6&label=" alt="NPM version"></a>
<a href="https://www.npmjs.com/package/@unlighthouse/core" target="__blank"><img alt="NPM Downloads" src="https://img.shields.io/npm/dm/@unlighthouse/core?color=349dbe&label="></a>
<a href="https://unlighthouse.dev/" target="__blank"><img src="https://img.shields.io/static/v1?label=&message=docs%20%26%20demos&color=45b8cd" alt="Docs & Demos"></a>
<br>
<a href="https://github.com/harlan-zw/unlighthouse" target="__blank"><img alt="GitHub stars" src="https://img.shields.io/github/stars/harlan-zw/unlighthouse?style=social"></a>
</p>

<br>

<p align="center">
Unlighthouse is an entire site audit tool with a modern UI for scanning live and development sites using Google Lighthouse
</p>

<p align="center">
  <a href="https://unlighthouse.dev/>Documentation</a>
</p>

<p align="center">
<table>
<tbody>
<td align="center">
<img width="2000" height="0" /><br>
Status: <b>Private Early Access 🎉</b><br>
<sub>Made possible by my <a href="https://github.com/sponsors/harlan-zw">Sponsor Program 💖</a></sub><br>
<img width="2000" height="0" />
</td>
</tbody>
</table>
</p>


## Features

### ⚡️ [**Fast**](https://vitejs.dev)

Take advantage of your CPU with multi-threaded workers powered by <a href="https://github.com/thomasdondorf/puppeteer-cluster" target="_blank" rel="noopener">puppeteer-cluster</a> and use opportunistic throttling and categories for lightning quick scans.

### 🌈 [**Modern UI**](https://sli.dev/guide/syntax.html#embedded-styles)

View your sites' health as a whole with the Unlighthouse client built with Vite. Easily see, search and sort your pages, re-scan individual pages and more.

### 🐞 [**Advanced Crawling**](https://vitejs.dev)

Pre-packed with fast, configurable URL discovery using <a href="https://github.com/seantomburke/sitemapper" target="_blank" rel="noopener">sitemap.xml</a> or internal link parsing.

### ️🤓 [**Intelligent URL Sampling**](https://vitejs.dev)

Scanning a website with thousands of pages? No problem.

Point Unlighthouse to the local project for the scan and any dynamic routes will be sampled based on your page files.

### 🍬️ [**SEO Goodies**](https://vitejs.dev)

View all of your pages titles, share images, meta descriptions, see how many internal and external links you have.

### 🧑‍💻 [**Integrated Development**](https://sli.dev/guide/syntax.html#code-blocks)

Finding issues with your site is one thing, fixing them is another. Unlighthouse comes packed with local development plugins for most
popular frameworks.

See which file belongs to a URL, fix your issue, unlighthouse will automatically re-audit the page!

### 🤖 [**CI Ready**](https://sli.dev/guide/syntax.html#code-blocks)

Set a budget for all each category, scan all pages, know if any of the pages breaks the budget. Easy.

Use the CI to upload your sites reports and access them all at any time, like <a href="https://inspect.unlighthouse.dev/">inspect.unlighthouse.dev</a>.

### 🛠 [**Hackable**](https://vitejs.dev)

Unlighthouse was built to modify, with isolate packages, robust API and a generous hook system. You can even modify the columns in the client!

## Getting Started

If at any point you get stuck and need a hand, please join the [Discord](https://unlighthouse.dev/chat) and I'll be happy to help you out.

### Unlighthouse - Live Sites

Ensure you're using [Node.js >=14](https://nodejs.org/) and run the following command:

```bash
# NPM
npx unlighthouse --site <your-site>
# or PNPM
pnpm dlx unlighthouse --site <your-site>
```

By default, Unlighthouse will try and find your Google Chrome installation and use that with puppeteer.
If you have issues with that you can install puppeteer globally.

```bash
npm install -g puppeteer
```

#### gitignore

Unlighthouse will save your reports in `outputDir` (`.lighthouse` by default), it's recommended you .gitignore this files.

#### Debugging

As Unlighthouse is in early access, it's recommended you run it in debug mode.

```bash
# NPM
npx unlighthouse --site harlanzw.com --debug
# or PNPM
pnpm dlx unlighthouse --site harlanzw.com  --debug
```

#### Configuration

The easiest way to configure the scan is to create a `unlighthouse.config.ts` in the directory
you're running the command.

```ts
export default {
    site: 'harlanzw.com',
    scanner: {
        // exclude specific routes
        exclude: [
            '/.*?pdf',
            '.*/amp',
            'en-*',
        ],
        // run lighthouse for each URL 3 times
        samples: 3,
        // use desktop to scan
        device: 'desktop',
        // enable the throttling mode
        throttle: true,
    },
    debug: true,
}
```

See [Config](https://unlighthouse.dev/config/#configuration) for the full details on what you can provide.

### Unlighthouse - Development Sites

See [integrations](https://unlighthouse.dev/integrations/) on how you can run Unlighthouse in your development environment.

#### Nuxt

```bash
# NPM
npm add -D @unlighthouse/nuxt
# or Yarn
yarn add -D @unlighthouse/nuxt
# or PNPM
pnpm add -D @unlighthouse/nuxt
```

Within your `nuxt.config.ts`, add the module to your `buildModules`. Once you start your nuxt app you can visit `/__unlighthouse` to view
the client.

### Unlighthouse - CI

Unlighthouse can be ran in a CI mode to:
- to perform an assertion on a specific score budget
- generate a static build of the report

#### Budget

Unlighthouse simplifies budget assertions. You can provide a single budget number which will be used
to validate all pages and on all selected categories. 

```bash
# Install unlighthouse
npm install -g unlighthouse
# Run the CI with a budget, will fail if any pages report any category less than 50
unlighthouse-ci --site <your-site> --debug --budget 50
```


#### Static Build

**Examples**
- https://vue-demo.unlighthouse.dev/
- https://inspect.unlighthouse.dev/

**Instructions**

Install Unlighthouse and run the ci script

```bash
# NPM
npm install -g unlighthouse
unlighthouse-ci --site harlanzw.com --debug --build-static
```

This will generate files in your `outputPath` (`.lighthouse` by default).

You can upload the directory `client` to a static host from there. 

For example using Github Actions with Netlify:

```yml
  - name: Deploy to Netlify
    uses: nwtgck/actions-netlify@v1.2
    with:
      publish-dir: './.lighthouse/client'
      production-branch: main
      production-deploy: true
      github-token: ${{ secrets.GITHUB_TOKEN }}
      deploy-message: "New Release Deploy from GitHub Actions"
      enable-pull-request-comment: false
      enable-commit-comment: true
      overwrites-pull-request-comment: true
    env:
      NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
      NETLIFY_SITE_ID: ${{ secrets.NETLIFY_DEMO_SITE_ID }}
    timeout-minutes: 1
```



## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/harlan-zw/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/harlan-zw/static/sponsors.svg'/>
  </a>
</p>

## License

MIT License © 2022 [Harlan Wilton](https://github.com/harlan-zw)
