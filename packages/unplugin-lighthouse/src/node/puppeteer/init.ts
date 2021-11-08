import { Cluster } from 'puppeteer-cluster'
import { Options, LighthouseTaskArgs, LighthouseTaskReturn } from '../../types'

export const init = async(options: Options) => {
  const cluster: Cluster<LighthouseTaskArgs, LighthouseTaskReturn> = await Cluster.launch({
    puppeteerOptions: {
      ...options.puppeteerOptions,
    },
    ...options.puppeteerClusterOptions,
  })
  return cluster
}
