import { Cluster } from 'puppeteer-cluster'
import type { UnlighthousePuppeteerCluster } from '../types'
import { useUnlighthouse } from '../unlighthouse'

/**
 * Create an instance of puppeteer-cluster
 */
export const launchPuppeteerCluster = async(): Promise<UnlighthousePuppeteerCluster> => {
  const { resolvedConfig } = useUnlighthouse()
  const cluster = await Cluster.launch({
    puppeteerOptions: {
      ...resolvedConfig.puppeteerOptions,
    },
    ...resolvedConfig.puppeteerClusterOptions,
  }) as unknown as UnlighthousePuppeteerCluster
  // hacky solution to mock the display which avoids spamming the console while still monitoring system stats
  cluster.display = {
    log() {},
    resetCursor() {},
  }
  return cluster
}
