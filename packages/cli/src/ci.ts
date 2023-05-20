import type { UserConfig } from '@unlighthouse/core'
import fs from 'fs-extra'
import {
  createUnlighthouse,
  generateClient,
  useLogger,
  useUnlighthouse,
} from '@unlighthouse/core'
import { relative } from 'pathe'
import { isCI } from 'std-env'
import { handleError } from './errors'
import type { CiOptions } from './types'
import { pickOptions, validateHost, validateOptions } from './util'
import createCli from './createCli'
import { generateReportPayload, outputReport } from './reporters'

async function run() {
  const startTime = new Date()

  const cli = createCli()

  cli.option(
    '--budget <budget>',
    'Budget (1-100), the minimum score which can pass.',
  )
  cli.option(
    '--build-static <build-static>',
    'Build a static website for the reports which can be uploaded.',
  )
  cli.option('--report', 'What type of report to generate from the results. Options are: jsonSimple, jsonExpanded or false.')

  const { options } = cli.parse() as unknown as { options: CiOptions }

  if (options.help || options.version)
    return

  const resolvedOptions: UserConfig = pickOptions(options)
  resolvedOptions.ci = {
    budget: options.budget || undefined,
    buildStatic: options.buildStatic || false,
  }

  await createUnlighthouse(
    {
      ...resolvedOptions,
      hooks: {
        'resolved-config': async (config) => {
          await validateHost(config)
        },
      },
      cache: false,
    },
    { name: 'ci' },
  )

  const { resolvedConfig, setCiContext, hooks, worker, start }
    = useUnlighthouse()

  validateOptions(resolvedConfig)

  const logger = useLogger()

  let hasBudget = true
  if (!resolvedConfig.ci?.budget) {
    hasBudget = false
    logger.warn(
      'Warn: No CI budget has been set. Consider setting a budget with the config (`ci.budget`) or --budget <number>.',
    )
  }

  await setCiContext()
  await start()

  hooks.hook('worker-finished', async () => {
    const end = new Date()
    const seconds = Math.round((end.getTime() - startTime.getTime()) / 1000)

    logger.success(
      `Unlighthouse has finished scanning \`${resolvedConfig.site}\`: ${worker.reports().length
      } routes in \`${seconds}s\`.`,
    )

    let hadError = false
    if (hasBudget) {
      logger.info('Running score budgets.', resolvedConfig.ci.budget)
      worker.reports().forEach((report) => {
        const categories = report.report?.categories
        if (!categories)
          return

        Object.values(categories).forEach((category) => {
          let budget = resolvedConfig.ci.budget
          if (!Number.isInteger(budget)) {
            // @ts-expect-error need to fix
            budget = resolvedConfig.ci.budget[category.key]
          }
          if (category.score && category.score * 100 < budget) {
            logger.error(
              `${report.route.path} has invalid score \`${category.score}\` for category \`${category.key}\`.`,
            )
            hadError = true
          }
        })
      })
      if (!hadError)
        logger.success('Score assertions have passed.')
    }
    if (resolvedConfig.ci.reporter) {
      const reporter = resolvedConfig.ci.reporter as any as string
      const payload = generateReportPayload(reporter, worker.reports())
      const path = relative(resolvedConfig.root, await outputReport(reporter, resolvedConfig, payload))
      logger.success(`Generated ${resolvedConfig.ci.reporter} report: ./${path}`)
    }

    if (resolvedConfig.ci?.buildStatic) {
      logger.info('Generating static report.')
      const { runtimeSettings, resolvedConfig } = useUnlighthouse()
      await generateClient({ static: true })
      // delete the json lighthouse payloads, we don't need them for the static mode
      const globby = await import('globby')
      const jsonPayloads = await globby.globby(
        ['lighthouse.json', '**/lighthouse.json', 'assets/lighthouse.fbx'],
        { cwd: runtimeSettings.generatedClientPath, absolute: true },
      )
      logger.debug(
        `Deleting ${jsonPayloads.length} files not required for static build.`,
      )
      for (const k in jsonPayloads) await fs.rm(jsonPayloads[k])

      const relativeDir = `./${relative(resolvedConfig.root, runtimeSettings.generatedClientPath)}`
      logger.success(`Static report is ready for uploading: \`${relativeDir}\``)
      if (!isCI) {
        // tell the user they can preview it using sirv-cli and link them to the docs
        logger.info(`You can preview the static report using \`npx sirv-cli ${relativeDir}\`.`)
        logger.info('For deployment demos, see https://unlighthouse.com/docs/deployment')
      }

      process.exit(0)
    }
    else {
      logger.error('Some routes failed the budget.')
      process.exit(1)
    }
  })
}

run().catch(handleError)
