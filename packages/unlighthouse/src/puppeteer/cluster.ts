import { Cluster } from 'puppeteer-cluster'
import { Options, UnlighthouseCluster } from '@shared'

export const launchCluster = async(options: Options): Promise<UnlighthouseCluster> => {
  const cluster = await Cluster.launch({
    puppeteerOptions: {
      ...options.puppeteerOptions,
    },
    ...options.puppeteerClusterOptions,
  }) as unknown as UnlighthouseCluster
  // mock the display to avoid spamming the console while still monitoring system stats
  cluster.display = {
    log() {},
    resetCursor() {},
  }
  return cluster
}
