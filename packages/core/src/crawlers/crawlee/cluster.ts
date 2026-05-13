import type { UnlighthouseContext, UnlighthousePuppeteerCluster } from '@unlighthouse/contracts'
import { Cluster } from 'puppeteer-cluster'

/**
 * Create an instance of puppeteer-cluster
 */
export async function launchPuppeteerCluster(ctx: UnlighthouseContext): Promise<UnlighthousePuppeteerCluster> {
  const { resolvedConfig } = ctx
  // @ts-expect-error untyped
  const cluster = await Cluster.launch({
    puppeteerOptions: resolvedConfig.puppeteerOptions,
    ...resolvedConfig.puppeteerClusterOptions,
  }) as unknown as UnlighthousePuppeteerCluster
  // hacky solution to mock the display which avoids spamming the console while still monitoring system stats
  cluster.display = {
    log() {},
    resetCursor() {},
  }
  return cluster
}
