import { join } from 'path'
import cac from 'cac'
import type { UserConfig } from 'unlighthouse-utils'
import fs from 'fs-extra'
import { version } from '../package.json'
import { createUnlighthouse } from './core/unlighthouse'
import { useLogger } from './core/logger'
import { APP_NAME } from './core/constants'

const cli = cac(APP_NAME)

cli
  .help()
  .version(version)
  .option('--host <host>', 'Host')
  .option('--root <root>', 'Root')
  .option('--budget <budget>', 'Budget')
  .option('--config-file <config-file>', 'Config File')
  .option('--debug', 'Debug')

const parsed = cli.parse()

async function run() {
  if (parsed.options.help)
    return

  if (parsed.options.budget) {
    parsed.options.ci = {
      budget: parsed.options.budget,
    }
    delete parsed.options.budget
  }

  if (parsed.options?.['--'])
    delete parsed.options['--']

  const options = parsed.options as unknown as UserConfig

  const logger = useLogger()
  const unlighthouse = await createUnlighthouse({
    debug: true,
    cacheReports: false,
    ...options,
  }, { name: 'ci' })
  if (!unlighthouse.resolvedConfig.ci?.budget) {
    logger.error('No CI budget has been set, not running. Please set a budget with the config (`ci.budget`) or --budget <number>.')
    process.exit(0)
    return
  }
  unlighthouse.setCiContext()
  await unlighthouse.start()
  unlighthouse.hooks.hook('worker-finished', async() => {
    logger.success(`Unlighthouse has finished scanning ${unlighthouse.resolvedConfig.host}, running score budgets.`)
    let hadError = false
    unlighthouse.worker
      .reports()
      .forEach((report) => {
        const categories = report.report?.categories
        if (!categories)
          return

        Object.values(categories).forEach((category) => {
          let budget = unlighthouse.resolvedConfig.ci.budget
          if (!Number.isInteger(budget)) {
            // @ts-ignore
            budget = unlighthouse.resolvedConfig.ci.budget[category.id]
          }
          if (category.score && (category.score * 100) < budget) {
            logger.error(`${report.route.path} has invalid score \`${category.score}\` for category \`${category.id}\`.`)
            hadError = true
          }
        })
      })
    if (!hadError) {
      logger.success('All routes passed.')
      await fs.writeJson(join(unlighthouse.resolvedConfig.root, unlighthouse.resolvedConfig.outputPath, 'ci-result.json'), unlighthouse.worker.reports().map((report) => {
        return {
          path: report.route.path,
          score: report.report?.score,
        }
      }))
      process.exit(0)
    }
    else {
      logger.success('Some routes failed the budget.')
      process.exit(1)
    }
  })
  // wait until all are processed
  // while (unlighthouse.worker.cluster.workersBusy.length > 0) {
  //   console.log('busy', unlighthouse.worker.cluster.workersBusy)
  //   await unlighthouse.worker.cluster.waitForOne()
  // }
}

run()
