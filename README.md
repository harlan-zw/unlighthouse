![unlighthouse - Scan your entire website with Google Lighthouse.](https://repository-images.githubusercontent.com/423079536/c88a81ee-43ec-40fc-a615-1d29bbeaaeb4)

<h1>Unlighthouse</h1>

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

<p align="center">
Unlighthouse scans your entire site using Google Lighthouse,<br> with a modern UI, minimal config and smart sampling.
</p>

<p align="center"><a href="https://inspect.unlighthouse.dev/">View Demo</a></p>

<p align="center">
<table>
<tbody>
<td align="center">
<sub>Made possible by my <a href="https://github.com/sponsors/harlan-zw">Sponsor Program 💖</a><br> Follow me <a href="https://twitter.com/harlan_zw">@harlan_zw</a> 🐦 • Join <a href="https://discord.gg/275MBUBvgP">Discord</a> for help</sub><br>
</td>
</tbody>
</table>
</p>

### Quick Setup

Run the following command:

```bash
npx unlighthouse --site <your-site>
# or PNPM
pnpm dlx unlighthouse --site <your-site>
```

_Requirements: Node >= 20.x._

## Getting Started

Install instructions for all integrations can be found on the [docs](https://unlighthouse.dev/) site.

Need a hand? Join the [Discord](https://discord.gg/275MBUBvgP) for one-on-one help.

#### gitignore

Unlighthouse will save your reports in `outputDir`,
it's recommended you .gitignore these files.

```
.unlighthouse
```

#### CrUX API (Chrome User Experience Report)

ScaleLighthouse includes a CrUX API integration that displays real-world performance data from the Chrome UX Report. To enable it:

1. Go to the [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials)
2. Create or select a project
3. Enable the **Chrome UX Report API** for your project
4. Create an API key
5. Create a `.env` file in the `crux-api/` directory:

```
NITRO_GOOGLE_CRUX_API_TOKEN=your-api-key-here
```

#### Debugging

If you run into any issues with Unlighthouse, the first step should be to re-run the scan with debugging enabled.

```bash
# NPM
npx unlighthouse --site unlighthouse.dev --debug
# or PNPM
pnpm dlx unlighthouse --site unlighthouse.dev --debug
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

Licensed under the [MIT license](https://github.com/harlan-zw/unlighthouse/blob/main/LICENSE.md).

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/unlighthouse/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/unlighthouse

[npm-downloads-src]: https://img.shields.io/npm/dm/unlighthouse.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npmjs.com/package/unlighthouse

[license-src]: https://img.shields.io/github/license/harlan-zw/unlighthouse.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://github.com/harlan-zw/unlighthouse/blob/main/LICENSE.md
