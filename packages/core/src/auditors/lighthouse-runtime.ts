import type lighthouse from 'lighthouse'
import type puppeteer from 'puppeteer-core'

/** File URLs let hosts keep heavy engines outside the CLI installation. */
export interface LighthouseRuntime {
  lighthouse: string
  puppeteer: string
  chromePath?: string
}

export async function loadLighthouseRuntime(runtime?: LighthouseRuntime) {
  // Variable imports keep optional engines external to every core entrypoint.
  const lighthouseModule = runtime?.lighthouse ?? 'lighthouse'
  const puppeteerModule = runtime?.puppeteer ?? 'puppeteer-core'
  const [lh, pp] = await Promise.all([import(lighthouseModule), import(puppeteerModule)])
  return {
    lighthouse: lh.default as typeof lighthouse,
    puppeteer: pp.default as typeof puppeteer,
  }
}
