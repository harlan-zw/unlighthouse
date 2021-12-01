import { Cluster } from 'puppeteer-cluster'
import type { UnlighthouseCluster } from 'unlighthouse-utils'
import { useUnlighthouse } from '../core/unlighthouse'

export const launchCluster = async(): Promise<UnlighthouseCluster> => {
  const { resolvedConfig } = useUnlighthouse()
  const cluster = await Cluster.launch({
    puppeteerOptions: {
      ...resolvedConfig.puppeteerOptions,
    },
    ...resolvedConfig.puppeteerClusterOptions,
  }) as unknown as UnlighthouseCluster
  // mock the display to avoid spamming the console while still monitoring system stats
  cluster.display = {
    log() {},
    resetCursor() {},
  }
  return cluster
}
