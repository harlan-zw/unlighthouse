import { Cluster } from 'puppeteer-cluster'
import { Options, TaskFunctionArgs, TaskFunctionReturn } from '../../types'

export const init = async(options: Options) => {
  const cluster: Cluster<TaskFunctionArgs, TaskFunctionReturn> = await Cluster.launch({
    puppeteerOptions: {
      ...options.puppeteerOptions,
    },
    ...options.puppeteerClusterOptions,
  })
  return cluster
}
