import { Cluster } from 'puppeteer-cluster'
import { UnlighthouseCluster } from '@shared'
import { useUnlighthouseEngine } from '../core/engine'

export const launchCluster = async(): Promise<UnlighthouseCluster> => {
  const { resolvedConfig } = useUnlighthouseEngine()
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
