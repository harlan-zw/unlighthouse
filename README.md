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
Unlighthouse audits your entire site using Google Lighthouse and lets you navigate the reports with a modern UI. 
</p>

<p align="center">
  <a href="https://unlighthouse.dev/>Documentation</a>
</p>

<p align="center">
<table>
<tbody>
<td align="center">
<img width="2000" height="0" /><br>
Status: <b>Private Beta 🎉</b><br>
<sub>Made possible by my <a href="https://github.com/sponsors/harlan-zw">Sponsor Program 💖</a></sub><br>
<img width="2000" height="0" />
</td>
</tbody>
</table>
</p>

## Features

### ⚡️ [**Fast**](https://vitejs.dev)

Take advantage of your CPU with multi-threaded workers powered by [puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster) and use opportunistic throttling and categories for lightning quick scans.

### 🐞 [**Dual Crawling**](https://vitejs.dev)

Pre-packed with automatic URL discovery using [sitemap.xml crawling](https://github.com/seantomburke/sitemapper) or use internal link parsing.

### 🌈 [**Modern UI**](https://sli.dev/guide/syntax.html#embedded-styles)

View your sites' health as a whole with the provided Vite UI. Easily see, search and sort your pages, re-scan individual pages and more. 

### ️🤓 [**Intelligent Sampling**](https://vitejs.dev)

Scanning a website with thousands of pages? No problem.

Hook up your local project with the scan, you can intelligently sample your URLs, only scanning ones which
are generated with unique code.

### 🍬️ [**SEO Goodies**](https://vitejs.dev)

Easily see all of your pages share images, analyze your meta descriptions, see how many internal and external links you have.

### 🧑‍💻 [**Integrated Development**](https://sli.dev/guide/syntax.html#code-blocks)

Finding issues with your site is one thing, fixing them is another. Unlighthouse comes packed with local development plugins for most
popular frameworks.

See which file belongs to a URL, fix your issue, unlighthouse will automatically re-audit the page!

### 🤖 [**CI Ready**](https://sli.dev/guide/syntax.html#code-blocks)

Set a budget for all each category, scan all pages, know if any of the pages breaks the budget. Easy.

### 🛠 [**Hackable**](https://vitejs.dev)

Unlighthouse was built to modify, with isolate packages, robust API and a generous hook system.


## Getting Started

### Unlighthouse - Live Sites

Ensure you're using [Node.js >=14](https://nodejs.org/) and run the following command:

```bash
npm add -G unlighthouse
```

```bash
unlighthouse --host https://unlighthouse.dev/
```


### Unlighthouse - Development Sites

See [integrations](https://unlighthouse.dev/integrations/) on how you can run Unlighthouse in your development environment.


### Try it Online ⚡️

[unlighthouse.dev/new](https://unlighthouse.dev/new)

[![](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://unlighthouse.dev/new)


## Sponsors

This project is made possible by all the sponsors supporting my work:

<p align="center">
  <a href="https://github.com/sponsors/harlan-zw">
    <img src='https://cdn.jsdelivr.net/gh/harlan-zw/static/sponsors.svg'/>
  </a>
</p>

## License

MIT License © 2022 [Harlan Wilton](https://github.com/harlan-zw)
