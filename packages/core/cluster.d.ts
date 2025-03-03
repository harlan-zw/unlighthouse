import type { LaunchOptions, Page } from 'puppeteer-core'
import { EventEmitter } from 'node:events'

export interface ResourceData {
  page: Page
  [key: string]: any
}

export interface JobInstance {
  resources: ResourceData
  /**
   * Called to close the related resources
   */
  close: () => Promise<void>
}

export interface WorkerInstance {
  jobInstance: () => Promise<JobInstance>
  /**
   * Closes the worker (called when the cluster is about to shut down)
   */
  close: () => Promise<void>
  /**
   * Repair is called when there is a problem with the worker (like call or close throwing
   * an error)
   */
  repair: () => Promise<void>
}

export type ConcurrencyImplementationClassType = new (options: LaunchOptions, puppeteer: any) => ConcurrencyImplementation

export default abstract class ConcurrencyImplementation {
  protected options: LaunchOptions
  protected puppeteer: any
  /**
   * @param options  Options that should be provided to puppeteer.launch
   * @param puppeteer  puppeteer object (like puppeteer or puppeteer-core)
   */
  constructor(options: LaunchOptions, puppeteer: any)
  /**
   * Initializes the manager
   */
  abstract init(): Promise<void>
  /**
   * Closes the manager (called when cluster is about to shut down)
   */
  abstract close(): Promise<void>
  /**
   * Creates a worker and returns it
   */
  abstract workerInstance(perBrowserOptions: LaunchOptions | undefined): Promise<WorkerInstance>
}

interface ClusterOptions {
  concurrency: number | ConcurrencyImplementationClassType
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
export type ClusterOptionsArgument = Partial<ClusterOptions>
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
