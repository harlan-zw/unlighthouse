# Generating Static Reports

## Introduction

When you run Unlighthouse using `npx unlighthouse`, you're using the CLI mode. This mode generates and runs the interactive client.

This is useful for quickly scanning your site and finding issues. 

However, you want to set up some automation around these reports. Creating reports that can be accessed through a static host.

Unlighthouse ships with a [CI](/integrations/ci) mode which provides additional non-interactive features, one of them is generating static reports.

## Using the CI mode

You'll need to manually install the CLI as a dependency to use `unlighthouse-ci` from the command line.

```bash
npm install -g @unlighthouse/cli
# yarn global add @unlighthouse/cli
# pnpm install -g @unlighthouse/cli
```

Please refer to the [CI](/integrations/ci) documentation for all features.

## Static Reports

There are many types of reports you can generate.

## Interactive HTML Reports

You can create static, self-hosted reports for your sites using the CI. This allows you to generate an always up-to-date version
of how your site is performing overall.

You can see an example of this here: https://inspect.unlighthouse.dev/.

You can generate a report like this by providing the `--build-static` flag.

```bash
unlighthouse-ci --site <your-site> --build-static
```

This will generate files in your `outputPath` (`.unlighthouse` by default). You can upload the `client` directory to a static host from there.

If you want to preview the static report you can run `npx sirv-cli .unlighthouse/client`

Note: You will need to host your site using a web server.

#### CloudFlare Pages Example

You should create a CloudFlare Pages site using [Direct Upload](https://developers.cloudflare.com/pages/platform/direct-upload/).

You will use the [wrangler](https://developers.cloudflare.com/pages/platform/using-wrangler) CLI to upload the static report.

You will need to init wrangler and configure it for your requirements.

```bash
wrangler init
```

You can then run the following command to generate the static report and upload it to CloudFlare Pages.

```bash
unlighthouse-ci --site www.example.com --build-static && wrangler pages publish .unlighthouse 
```

#### GitHub Actions & Netlify Example

This example is for GitHub Actions and deploys a static client build to Netlify.

```yml unlighthouse.yml
name: Assertions and static report

on:
  workflow_dispatch:

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0

      - name: Install Dependencies
        run: npm add -g @unlighthouse/cli puppeteer

      - name: Unlighthouse assertions and client
        run: unlighthouse-ci --site <your-site> --build-static

      - name: Deploy report to Netlify
        uses: nwtgck/actions-netlify@v1.2
        with:
          publish-dir: './.unlighthouse'
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

## CSV Reports

You can generate a CSV report by providing the `--reporter csv` or `--reporter csvExpanded` flag.

```bash
unlighthouse-ci --site <your-site> --reporter csv
```

Note: This report format is experimental and may change in the future.

This will generate a report like the following (`csvExpanded` sample):

```csv
URL,Score,Performance,Accessibility,Best Practices,SEO,Largest Contentful Paint,Cumulative Layout Shift,FID,Blocking,Color Contrast,Headings,Image Alts,Link Names,Errors,Inspector Issues,Images Responsive,Image Aspect Ratio,Indexable,Tap Targets
"/",93,72,100,100,100,3211.44,0,290.36,562.29,1,1,1,1,1,1,1,1,1,1
"/blog",94,77,100,100,100,3911.7,0,205.57,260.03,1,1,1,1,1,1,1,1,1,1
"/blog/2023-april",88,51,100,100,100,4925.84,0,311.24,797.95,1,1,1,1,1,1,1,1,1,1
"/blog/2023-february",96,82,100,100,100,3207.98,0,209.96,302.01,1,1,1,1,1,1,1,1,1,1
"/blog/nuxt-3-migration-cheatsheet",85,43,97,100,100,4373.88,0,1581.52,2820.75,0,1,1,1,1,1,1,1,1,1
"/blog/vue-automatic-component-imports",93,74,97,100,100,1696.51,0,793.36,1314.27,0,1,1,1,1,1,1,1,1,1
"/blog/vue-use-head-v1",82,30,97,100,100,8053.8,0,379.59,1127.99,0,1,1,1,1,1,1,1,1,1
"/projects",92,66,100,100,100,3666.86,0,322.48,625.51,1,1,1,1,1,1,1,1,1,1
"/sponsors",92,69,100,100,100,4438.15,0,362.62,408.63,1,1,1,1,1,1,1,1,1,1
"/talks",98,90,100,100,100,864.86,0,390.93,427.94,1,1,1,1,1,1,1,1,1,1
```


## JSON Reports

You can generate a JSON report by providing the `--reporter json` or `--reporter jsonExpanded` flag.

```bash
unlighthouse-ci --site <your-site> --reporter json
```

Note: This report format is experimental and may change in the future.

This will generate a report like the following (`json` sample):

```json
[
  {
    "path": "/",
    "score": 0.97,
    "performance": 0.87,
    "accessibility": 1,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/blog",
    "score": 0.98,
    "performance": 0.91,
    "accessibility": 1,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/blog/2023-february",
    "score": 0.91,
    "performance": 0.65,
    "accessibility": 1,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/blog/modern-package-development",
    "score": 0.9,
    "performance": 0.61,
    "accessibility": 0.97,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/blog/scale-your-vue-components",
    "score": 0.87,
    "performance": 0.51,
    "accessibility": 0.97,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/blog/vue-automatic-component-imports",
    "score": 0.88,
    "performance": 0.53,
    "accessibility": 0.97,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/blog/vue-use-head-v1",
    "score": 0.97,
    "performance": 0.9,
    "accessibility": 0.97,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/projects",
    "score": 0.94,
    "performance": 0.77,
    "accessibility": 1,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/sponsors",
    "score": 0.97,
    "performance": 0.88,
    "accessibility": 1,
    "best-practices": 1,
    "seo": 1
  },
  {
    "path": "/talks",
    "score": 0.94,
    "performance": 0.74,
    "accessibility": 1,
    "best-practices": 1,
    "seo": 1
  }
]
```

