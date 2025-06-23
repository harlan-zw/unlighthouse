Describe the bug
We've been using unlighthouse-ci in our pipeline for the past 6 months, but it randomly stopped working last week. We have it setup so that it pushes scores to a LHCI server.

Here's the output after starting a test with debug mode on. It seems that it just gets stuck. it doesnt even exit/timeout from the process. (Hence wasting a lot of pipeline minutes)

❯ unlighthouse-ci  --lhci-build-token ******** --lhci-host ******* --site https://stg.beno.com --debug
[Unlighthouse 9:11:46 AM] ⚙ Starting Unlighthouse at root: /Users/saadwrk/Developer/Beno/beno-webapp cwd: /Users/saadwrk/Developer/Beno/beno-webapp
⚙ Discovered config definition { config: undefined, sources: [] }                                 Unlighthouse 9:11:46 AM
⚙ Unable to locale page files, disabling route discovery.                                         Unlighthouse 9:11:46 AM
ℹ Using system chrome located at: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome.   Unlighthouse 9:11:46 AM
⚙ Post config resolution { routerPrefix: '/',                                                     Unlighthouse 9:11:46 AM
apiPrefix: '/api',
cache: false,
client:
{ groupRoutesKey: 'route.definition.name',
columns:
{ overview: [Array],
performance: [Array],
accessibility: [Array],
'best-practices': [Array],
seo: [Array] } },
scanner:
{ customSampling: {},
ignoreI18nPages: true,
maxRoutes: 200,
skipJavascript: true,
samples: 1,
throttle: true,
crawler: true,
dynamicSampling: 8,
sitemap: true,
robotsTxt: true,
device: 'mobile',
exclude: [ '/cdn-cgi/*' ] },
server: { port: 5678, showURL: false, open: true },
discovery: false,
root: '/Users/saadwrk/Developer/Beno/beno-webapp',
outputPath: '/Users/saadwrk/Developer/Beno/beno-webapp/.unlighthouse',
debug: true,
puppeteerOptions:
{ headless: true,
ignoreHTTPSErrors: true,
timeout: 0,
protocolTimeout: 0,
defaultViewport:
{ mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
puppeteerClusterOptions:
{ timeout: 300000,
monitor: true,
workerCreationDelay: 500,
retryLimit: 3,
maxConcurrency: 9,
skipDuplicateUrls: false,
retryDelay: 2000,
concurrency: 3,
puppeteer:
PuppeteerNode {
_isPuppeteerCore: true,
_changedProduct: false,
connect: [Function: bound bound connect],
defaultBrowserRevision: '127.0.6533.88',
configuration: [Object],
launch: [Function: bound launch],
executablePath: [Function: bound executablePath],
defaultArgs: [Function: bound defaultArgs],
trimCache: [Function: bound trimCache] AsyncFunction } },
lighthouseOptions:
{ onlyCategories: [ 'performance', 'accessibility', 'best-practices', 'seo' ],
throttlingMethod: 'simulate',
throttling:
{ rttMs: 150,
throughputKbps: 1638.4,
requestLatencyMs: 600,
downloadThroughputKbps: 1638.4,
uploadThroughputKbps: 750,
cpuSlowdownMultiplier: 1 },
formFactor: 'mobile',
screenEmulation:
{ mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
emulatedUserAgent:
'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36' },
urls: [],
site: 'https://stg.beno.com',
ci:
{ budget: undefined,
buildStatic: false,
reporter: 'jsonSimple',
reporterConfig:
{ lhciHost: '*******',
lhciBuildToken: '********',
lhciAuth: undefined } },
hooks: { 'resolved-config': [AsyncFunction: resolved-config] },
chrome:
{ useSystem: true,
useDownloadFallback: true,
downloadFallbackCacheDir: '/Users/saadwrk/.unlighthouse' } }
⚙ Testing Site https://stg.beno.com is valid.                                                     Unlighthouse 9:11:46 AM
✔ Successfully connected to https://stg.beno.com. (Status: 200).                                  Unlighthouse 9:11:46 AM
⚙ Setting Unlighthouse Site URL [Site: https://stg.beno.com/]                                     Unlighthouse 9:11:46 AM
⚙ Setting Unlighthouse CI Context [Site: https://stg.beno.com]                                    Unlighthouse 9:11:46 AM
[Unlighthouse 9:11:46 AM] ⚙ cache is disabled, deleting cache folder: /Users/saadwrk/Developer/Beno/beno-webapp/.unlighthouse
⚙ Starting Unlighthouse [Server: N/A Site: https://stg.beno.com Debug: true]                      Unlighthouse 9:11:46 AM
⚙ Scanning https://stg.beno.com/robots.txt                                                        Unlighthouse 9:11:46 AM
⚙ Found robots.txt                                                                                Unlighthouse 9:11:47 AM
ℹ Found /robots.txt, using entries. Sitemaps: 1, Groups: 1.                                       Unlighthouse 9:11:47 AM
⚙ Attempting to fetch sitemap at https://www.beno.com/sitemap.xml                                 Unlighthouse 9:11:47 AM
Urlset found during "crawl('https://www.beno.com/sitemap.xml')"
⚙ Fetched https://www.beno.com/sitemap.xml with 46 URLs.                                          Unlighthouse 9:11:48 AM

WARN  Sitemap exists but is being ignored due to a different origin being present                 Unlighthouse 9:11:48 AM

⚙ Resolved reportable routes 1                                                                    Unlighthouse 9:11:48 AM
⚙ Route has been queued. Path: / Name: _index.                                                    Unlighthouse 9:11:48 AM
⚙ HTML extract of https://stg.beno.com response succeeded.                                        Unlighthouse 9:11:48 AM
ℹ Redirected url detected, this may cause issues in the final report. https://stg.beno.com/       Unlighthouse 9:11:48 AM
⚙ Page has an alternative lang, ignoring /: https://www.beno.com/                                 Unlighthouse 9:11:48 AM
⚙ Ignoring route /.                                                                               Unlighthouse 9:11:48 AM
Reproduction
No response

System / Nuxt Info
System:
OS: macOS 15.1
CPU: (10) arm64 Apple M2 Pro
Memory: 534.97 MB / 16.00 GB
Shell: 5.9 - /bin/zsh
Binaries:
Node: 20.11.1 - /usr/local/bin/node
npm: 10.2.4 - /usr/local/bin/npm
Browsers:
Chrome: 134.0.6998.118
Safari: 18.1
Activity
jbouder
jbouder commented 2 days ago
jbouder
(Johnny Bouder)
2 days ago
Contributor
@saadsme , just wanted to see if you were able to resolve this. I've just implemented a bunch of updates to my config and am now seeing this as well.
