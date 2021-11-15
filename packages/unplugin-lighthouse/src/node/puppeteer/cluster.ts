import { Cluster } from 'puppeteer-cluster'
import { Options, LighthouseTaskArgs, LighthouseTaskReturn } from '../../types'

export const launchCluster = async(options: Options) => {
  const cluster: Cluster<LighthouseTaskArgs, LighthouseTaskReturn> = await Cluster.launch({
    puppeteerOptions: {
      ...options.puppeteerOptions,
    },
    ...options.puppeteerClusterOptions,
  })
  // mock the display to avoid spamming the console while still monitoring system stats
  // @ts-ignore
  cluster.display = {
    log (s: string) {},
    resetCursor() {}
  }
  return cluster
}
