import { join } from 'path'
import type { UserConfig } from '@unlighthouse/core'
import fs from 'fs-extra'
import { createUnlighthouse, generateClient, useLogger, useUnlighthouse } from '@unlighthouse/core'
import { handleError } from './errors'
import type { CiOptions } from './types'
import { pickOptions, validateOptions } from './util'
import createCli from './createCli'

async function run() {
  const start = new Date()

  const logger = useLogger()
  const cli = createCli()

  cli.option('--budget <budget>', 'Budget (1-100), the minimum score which can pass.')
  cli.option('--build-static <build-static>', 'Build a static website for the reports which can be uploaded.')

  const { options } = cli.parse() as unknown as { options: CiOptions }

  if (options.help || options.version)
    return

  // allow site alias
  if (options.site)
    options.host = options.site

  const resolvedOptions: UserConfig = pickOptions(options)
  resolvedOptions.ci = {
    budget: options.budget || undefined,
    buildStatic: options.buildStatic || false,
  }

  await createUnlighthouse({
    ...resolvedOptions,
    cache: false,
  },
  { name: 'ci' },
  )

  const { resolvedConfig, setCiContext, hooks, worker } = useUnlighthouse()

  validateOptions(resolvedConfig)

  let hasBudget = true
  if (!resolvedConfig.ci?.budget) {
    hasBudget = false
    logger.warn('Warn: No CI budget has been set. Consider setting a budget with the config (`ci.budget`) or --budget <number>.')
  }

  await (await setCiContext()).start()

  hooks.hook('worker-finished', async() => {
    const end = new Date()
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000)

    logger.success(`Unlighthouse has finished scanning \`${resolvedConfig.site}\`: ${worker.reports().length} routes in \`${seconds}s\`.`)

    let hadError = false
    if (hasBudget) {
      logger.info('Running score budgets.', resolvedConfig.ci.budget)
      worker
        .reports()
        .forEach((report) => {
          const categories = report.report?.categories
          if (!categories)
            return

          Object.values(categories).forEach((category) => {
            let budget = resolvedConfig.ci.budget
            if (!Number.isInteger(budget)) {
              // @ts-expect-error need to fix
              budget = resolvedConfig.ci.budget[category.id]
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
      await fs.writeJson(join(resolvedConfig.root, resolvedConfig.outputPath, 'ci-result.json'),
        worker.reports()
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
        const { runtimeSettings } = useUnlighthouse()
        await generateClient({ static: true })
        // move the route files into the client package
        const reportDir = join(runtimeSettings.outputPath, 'routes')
        const outDir = join(runtimeSettings.generatedClientPath, 'routes')
        logger.debug(`Moving report dir ${reportDir} to ${outDir}`)
        await fs.move(reportDir, outDir, { overwrite: true })

        logger.success(`Static client generated at \`${runtimeSettings.generatedClientPath}\`, ready for hosting.`)
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
