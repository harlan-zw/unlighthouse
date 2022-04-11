![unlighthouse - Scan your entire website with Google Lighthouse.](https://next.unlighthouse.dev/og.png)
<p align="center">
<a href="https://www.npmjs.com/package/@unlighthouse/core" target="__blank"><img src="https://img.shields.io/npm/v/@unlighthouse/core?color=2B90B6&label=" alt="NPM version"></a>
<a href="https://www.npmjs.com/package/@unlighthouse/core" target="__blank"><img alt="NPM Downloads" src="https://img.shields.io/npm/dm/@unlighthouse/core?color=349dbe&label="></a>
<a href="https://unlighthouse.dev/" target="__blank"><img src="https://img.shields.io/static/v1?label=&message=docs%20%26%20demos&color=45b8cd" alt="Docs & Demos"></a>
<br>
<a href="https://github.com/harlan-zw/unlighthouse" target="__blank"><img alt="GitHub stars" src="https://img.shields.io/github/stars/harlan-zw/unlighthouse?style=social"></a>
</p>


<p align="center">
Unlighthouse scans your entire site using Google Lighthouse,<br> with a modern UI, minimal config and smart sampling.
</p>

<p align="center">
<table>
<tbody>
<td align="center">
<img width="2000" height="0" /><br>
Status: <b>Public Early Access 🎉</b><br>
<sub>Made possible by my <a href="https://github.com/sponsors/harlan-zw">Sponsor Program 💖</a><br> Follow me <a href="https://twitter.com/harlan_zw">@harlan_zw</a> 🐦</sub><br>
<img width="2000" height="0" />
</td>
</tbody>
</table>
</p>


## Scan your site quickly.

### ⚡️ Fast

Take advantage of your CPU with threaded workers and use opportunistic throttling and categories for lightning quick scans.

### 🐞 Automated URL Discovery

Fast, configurable URL discovery using sitemap.xml parsing, internal link crawling and project file scanning.

### ️🍣 Dynamic Route Sampling

Fewer URLs to scan with automatic sampling of dynamic routes. Hook up your local project files to make it even smarter.

## Visualise your sites health

### 🌈 Modern UI

View your sites' health as a whole with the Unlighthouse client built with Vite. Easily see, search and sort your pages, re-scan individual pages and more.

### 🍬️ SEO Goodies

View all of your pages titles, share images, meta descriptions, see how many internal and external links you have.

### ✅️ Accessibility Summary

See how your sites accessibility stacks up, find high-leverage issues to fix easily and visually see colour contrast issues.

## Built for Developers

### 🧑‍💻 Integrated Development

Finding issues with your site is one thing, fixing them is another. Unlighthouse comes packed with local development plugins for most
popular frameworks.

See which file belongs to a URL, fix your issue, unlighthouse will automatically re-audit the page!

### 🤖 CI Ready

Set a budget for all each category, scan all pages, know if any of the pages breaks the budget. Easy.

Use the CI to upload your sites reports and access them all at any time.

### 🛠 Hackable

Unlighthouse was built to modify, with isolated packages, robust API and a generous hook system. 
You can even modify the columns in the client!

## Getting Started

Install instructions for all integrations can be found on the [docs](https://unlighthouse.dev/) site.

Need a hand? Join the [Discord](https://unlighthouse.dev/chat) for one-on-one help.

### Quick Setup - CLI

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

Unlighthouse will save your reports in `outputDir` (`.unlighthouse` by default),
it's recommended you .gitignore these files.

#### Debugging

As Unlighthouse is in early access, it's recommended you run it in debug mode.

```bash
# NPM
npx unlighthouse --site unlighthouse.dev --debug
# or PNPM
pnpm dlx unlighthouse --site unlighthouse.dev  --debug
```

## Docs

Integration instructions, Guides, API and config spec can be found on [docs](https://unlighthouse.dev/) site.

## Sponsors

<p align="center">
  <a href="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg">
    <img src='https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg'/>
  </a>
</p>

## License

MIT License © 2022 [Harlan Wilton](https://github.com/harlan-zw)
