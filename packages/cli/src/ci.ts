import { join } from 'path'
import cac from 'cac'
import type { UserConfig } from '@unlighthouse/core'
import fs from 'fs-extra'
import { createUnlighthouse, useLogger } from '@unlighthouse/core'
import { pick } from 'lodash-es'
import { version } from '../package.json'
import { handleError } from './errors'
import { CiOptions } from './types'
import { validateOptions} from './util'
import {normaliseHost} from "@unlighthouse/core";

async function run() {
  const cli = cac('unlighthouse')

  cli
    .help()
    .version(version)
    .option('--host <host>', 'Host')
    .option('--root <root>', 'Root')
    .option('--budget <budget>', 'Budget')
    .option('--config-file <config-file>', 'Config File')
    .option('-d, --debug', 'Debug')

  const { options } = cli.parse() as unknown as { options: CiOptions }

  if (options.help)
    return

  const resolvedOptions: UserConfig = pick(options, ['host', 'root', 'configFile', 'debug'])
  if (options.budget) {
    resolvedOptions.ci = {
      budget: options.budget,
    }
  }

  resolvedOptions.host = normaliseHost(resolvedOptions.host!)
  validateOptions(resolvedOptions)

  const unlighthouse = await createUnlighthouse({
    ...resolvedOptions,
    cacheReports: false,
  },
  { name: 'ci' },
  )

  if (!unlighthouse.resolvedConfig.ci?.budget) {
    handleError('No CI budget has been set, not running. Please set a budget with the config (`ci.budget`) or --budget <number>.')
    return
  }

  await (await unlighthouse.setCiContext()).start()

  unlighthouse.hooks.hook('worker-finished', async() => {
    const logger = useLogger()
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
      await fs.writeJson(join(unlighthouse.resolvedConfig.root, unlighthouse.resolvedConfig.outputPath, 'ci-result.json'),
        unlighthouse.worker.reports()
          .map((report) => {
            return {
              path: report.route.path,
              score: report.report?.score,
            }
          })
        // make the list ordering consistent
          .sort((a, b) => a.path.localeCompare(b.path)),
      )
      process.exit(0)
    }
    else {
      logger.success('Some routes failed the budget.')
      process.exit(1)
    }
  })
}

run().catch(handleError)
