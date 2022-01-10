import { EventEmitter } from 'events'
import type { LaunchOptions, Page } from 'puppeteer'

interface ClusterOptions {
  concurrency: number | unknown
  maxConcurrency: number
  workerCreationDelay: number
  puppeteerOptions: LaunchOptions
  perBrowserOptions: LaunchOptions[] | undefined
  monitor: boolean
  timeout: number
  retryLimit: number
  retryDelay: number
  skipDuplicateUrls: boolean
  sameDomainDelay: number
  puppeteer: any
}
declare type Partial<T> = {
  [P in keyof T]?: T[P];
}
declare type ClusterOptionsArgument = Partial<ClusterOptions>
interface TaskFunctionArguments<JobData> {
  page: Page
  data: JobData
  worker: {
    id: number
  }
}
export declare type TaskFunction<JobData, ReturnData> = (arg: TaskFunctionArguments<JobData>) => Promise<ReturnData>
// hacky solution to get around Cluster.d.ts private fields
export class Cluster<JobData = any, ReturnData = any> extends EventEmitter {
  static CONCURRENCY_PAGE: number
  static CONCURRENCY_CONTEXT: number
  static CONCURRENCY_BROWSER: number
  public options
  public perBrowserOptions
  public workers
  public workersAvail
  public workersBusy
  public workersStarting
  public allTargetCount
  public jobQueue
  public errorCount
  public taskFunction
  public idleResolvers
  public waitForOneResolvers
  public browser
  public isClosed
  public startTime
  public nextWorkerId
  public monitoringInterval
  public display
  public duplicateCheckUrls
  public lastDomainAccesses
  public systemMonitor
  public checkForWorkInterval
  static launch(options: ClusterOptionsArgument): Promise<Cluster<any, any>>
  public constructor()
  public init
  public launchWorker
  task(taskFunction: TaskFunction<JobData, ReturnData>): Promise<void>
  public nextWorkCall
  public workCallTimeout
  public work
  public doWork
  public lastLaunchedWorkerTime
  public allowedToStartWorker
  public isTaskFunction
  public queueJob
  queue(data: JobData, taskFunction?: TaskFunction<JobData, ReturnData>): Promise<void>
  queue(taskFunction: TaskFunction<JobData, ReturnData>): Promise<void>
  execute(data: JobData, taskFunction?: TaskFunction<JobData, ReturnData>): Promise<ReturnData>
  execute(taskFunction: TaskFunction<JobData, ReturnData>): Promise<ReturnData>
  idle(): Promise<void>
  waitForOne(): Promise<JobData>
  close(): Promise<void>
  public monitor
}
