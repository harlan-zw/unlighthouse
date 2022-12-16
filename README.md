![unlighthouse - Scan your entire website with Google Lighthouse.](https://repository-images.githubusercontent.com/423079536/c88a81ee-43ec-40fc-a615-1d29bbeaaeb4)
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

<p align="center"><a href="https://inspect.unlighthouse.dev/">View Demo</a></p>

<p align="center">
<table>
<tbody>
<td align="center">
<img width="2000" height="0" /><br>
Status: <b>Public Early Access 🎉</b><br>
<sub>Made possible by my <a href="https://github.com/sponsors/harlan-zw">Sponsor Program 💖</a><br> Follow me <a href="https://twitter.com/harlan_zw">@harlan_zw</a> 🐦 • Join <a href="https://discord.gg/275MBUBvgP">Discord</a> for help</sub><br>
<img width="2000" height="0" />
</td>
</tbody>
</table>
</p>

### Quick Setup

Run the following command:

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

## Getting Started

Install instructions for all integrations can be found on the [docs](https://unlighthouse.dev/) site.

Need a hand? Join the [Discord](https://unlighthouse.dev/chat) for one-on-one help.

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
