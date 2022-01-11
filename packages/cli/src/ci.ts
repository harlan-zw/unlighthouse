import { join } from 'path'
import type { UserConfig } from '@unlighthouse/core'
import fs from 'fs-extra'
import { createUnlighthouse, useLogger } from '@unlighthouse/core'
import { pick } from 'lodash-es'
import { handleError } from './errors'
import type { CiOptions } from './types'
import { validateOptions } from './util'
import createCli from './createCli'

async function run() {
  const cli = createCli()

  cli.option('--budget <budget>', 'Budget (1-100), the minimum score which can pass.')

  const { options } = cli.parse() as unknown as { options: CiOptions }

  if (options.help || options.version)
    return

  const resolvedOptions: UserConfig = pick(options, ['host', 'root', 'configFile', 'debug'])
  if (options.budget) {
    resolvedOptions.ci = {
      budget: options.budget,
    }
  }

  const unlighthouse = await createUnlighthouse({
    ...resolvedOptions,
    cacheReports: false,
  },
  { name: 'ci' },
  )

  validateOptions(unlighthouse.resolvedConfig)

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
            // @ts-expect-error
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
