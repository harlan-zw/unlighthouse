import { join } from 'path'
import type { UserConfig } from '@unlighthouse/core'
import fs from 'fs-extra'
import { createUnlighthouse, generateClient, useLogger } from '@unlighthouse/core'
import { pick } from 'lodash-es'
import { handleError } from './errors'
import type { CiOptions } from './types'
import { validateOptions } from './util'
import createCli from './createCli'

async function run() {
  const logger = useLogger()
  const cli = createCli()

  cli.option('--budget <budget>', 'Budget (1-100), the minimum score which can pass.')
  cli.option('--build-static <build-static>', 'Build a static website for the reports which can be uploaded.')

  const { options } = cli.parse() as unknown as { options: CiOptions }

  if (options.help || options.version)
    return

  // allow site alias
  if (options.site) {
    options.host = options.site
  }

  const resolvedOptions: UserConfig = pick(options, ['host', 'root', 'configFile', 'debug'])
  resolvedOptions.ci = {
    budget: options.budget || undefined,
    buildStatic: options.buildStatic || false,
  }

  const unlighthouse = await createUnlighthouse({
    ...resolvedOptions,
    cacheReports: false,
  },
  { name: 'ci' },
  )

  validateOptions(unlighthouse.resolvedConfig)

  let hasBudget = true
  if (!unlighthouse.resolvedConfig.ci?.budget) {
    hasBudget = false
    logger.warn('Warn: No CI budget has been set. Consider setting a budget with the config (`ci.budget`) or --budget <number>.')
  }

  await (await unlighthouse.setCiContext()).start()

  unlighthouse.hooks.hook('worker-finished', async() => {
    logger.success(`Unlighthouse has finished scanning ${unlighthouse.resolvedConfig.host}`)
    let hadError = false
    if (hasBudget) {
      logger.info('Running score budgets.', unlighthouse.resolvedConfig.ci.budget)
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
    }
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

      if (options.buildStatic) {
        logger.info('Generating static client.')
        await generateClient({ static: true })
        // move the route files into the client package
        const reportDir = join(unlighthouse.runtimeSettings.outputPath, 'routes')
        const outDir = join(unlighthouse.runtimeSettings.generatedClientPath, 'routes')
        logger.debug(`Moving report dir ${reportDir} to ${outDir}`)
        await fs.move(reportDir, outDir, { overwrite: true })

        logger.success(`Static client generated at \`${unlighthouse.runtimeSettings.generatedClientPath}\`, ready for hosting.`)
      }

      process.exit(0)
    }
    else {
      logger.success('Some routes failed the budget.')
      process.exit(1)
    }
  })
}

run().catch(handleError)
