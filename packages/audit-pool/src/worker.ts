/**
 * @unlighthouse/audit-pool/worker — worker-thread runtime. Imports puppeteer; only loaded inside
 * worker threads. Driver bundles do not see these symbols.
 *
 *   // my-worker.mjs (this file is `workerFile` in ClusterOptions)
 *   import { createWorkerHandler, defineTask } from '@unlighthouse/audit-pool/worker'
 *
 *   const inspectHtml = defineTask(async ({ page }, { url }) => {
 *     await page.goto(url)
 *     return { title: await page.title() }
 *   })
 *
 *   export default createWorkerHandler({
 *     tasks: { inspectHtml },
 *     hooks: { 'page:created': async (page) => { ... } },
 *   })
 */
import type { Browser, BrowserContext, Page } from 'puppeteer-core'
import type { WorkerDefinition, WorkerHooks, WorkerTaskContext } from './types'
import { threadId } from 'node:worker_threads'
import { consola } from 'consola'
import { createHooks } from 'hookable'
import puppeteer from 'puppeteer-core'
import Tinypool from 'tinypool'

const logger = consola.withTag('audit-pool:worker')

export { defineTask } from './define'
export type { WorkerDefinition, WorkerHooks, WorkerTask, WorkerTaskContext } from './types'

interface InternalWorkerData {
  concurrency: 'browser' | 'context' | 'page'
  bare: boolean
  puppeteerOptions: Record<string, unknown>
  recycleAfter: number
  taskTimeout: number
  userWorkerData: Record<string, unknown>
}

/**
 * Wraps a `WorkerDefinition` into the function tinypool calls. Default-export the result.
 *
 * Per-thread state (browser, shared page, recycle counter, hooks) is captured in the closure;
 * each worker thread loads this module fresh, so the state is correctly per-worker.
 */
export function createWorkerHandler(definition: WorkerDefinition): (input: { taskName: string, payload: unknown }) => Promise<unknown> {
  let browser: Browser | undefined
  let sharedPage: Page | undefined
  let tasksRun = 0

  const hooks = createHooks<WorkerHooks>()
  if (definition.hooks)
    hooks.addHooks(definition.hooks)

  async function getBrowser(opts: InternalWorkerData): Promise<Browser> {
    if (browser)
      return browser
    browser = await puppeteer.launch(opts.puppeteerOptions)
    await hooks.callHook('browser:launched', browser)
    return browser
  }

  async function recycle(): Promise<void> {
    if (!browser)
      return
    await Promise.resolve(hooks.callHook('browser:closing', browser))
      .catch(err => logger.warn('browser:closing hook failed', err))
    if (sharedPage) {
      await Promise.resolve(hooks.callHook('page:closing', sharedPage))
        .catch(err => logger.warn('page:closing hook failed', err))
      sharedPage = undefined
    }
    await browser.close().catch(err => logger.warn('browser.close failed', err))
    browser = undefined
    tasksRun = 0
  }

  return async function dispatch({ taskName, payload }) {
    // Tinypool wraps workerData; use its accessor instead of node:worker_threads.workerData.
    const opts = Tinypool.workerData as InternalWorkerData
    const task = definition.tasks[taskName]
    if (!task)
      throw new Error(`[@unlighthouse/audit-pool/worker] unknown task "${taskName}"`)

    if (opts.bare) {
      const ctx: WorkerTaskContext = {
        workerData: opts.userWorkerData,
        threadId,
      }
      try {
        return await withTimeout(task(ctx, payload), opts.taskTimeout)
      }
      finally {
        tasksRun++
        // Bare workers have no browser to recycle; recycle is a no-op but tinypool can
        // still recycle the thread itself via Tinypool's `isolateWorkers` if desired.
      }
    }

    const b = await getBrowser(opts)
    let page: Page
    let context: BrowserContext
    let ephemeralContext: BrowserContext | undefined

    if (opts.concurrency === 'page') {
      context = b.defaultBrowserContext()
      if (!sharedPage) {
        sharedPage = await b.newPage()
        await hooks.callHook('page:created', sharedPage)
      }
      page = sharedPage
    }
    else if (opts.concurrency === 'context') {
      ephemeralContext = await b.createBrowserContext()
      await hooks.callHook('context:created', ephemeralContext)
      context = ephemeralContext
      page = await context.newPage()
      await hooks.callHook('page:created', page)
    }
    else {
      context = b.defaultBrowserContext()
      page = await b.newPage()
      await hooks.callHook('page:created', page)
    }

    const ctx: WorkerTaskContext = {
      browser: b,
      context,
      page,
      workerData: opts.userWorkerData,
      threadId,
    }

    try {
      return await withTimeout(task(ctx, payload), opts.taskTimeout)
    }
    finally {
      if (opts.concurrency !== 'page') {
        await Promise.resolve(hooks.callHook('page:closing', page))
          .catch(err => logger.warn('page:closing hook failed', err))
        await page.close().catch(err => logger.warn('page.close failed', err))
      }
      if (ephemeralContext)
        await ephemeralContext.close().catch(err => logger.warn('context.close failed', err))

      tasksRun++
      if (opts.recycleAfter > 0 && tasksRun >= opts.recycleAfter)
        await recycle()
    }
  }
}

function withTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T> {
  if (ms <= 0)
    return Promise.resolve(promise)
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Task exceeded timeout of ${ms}ms`)), ms)
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}
