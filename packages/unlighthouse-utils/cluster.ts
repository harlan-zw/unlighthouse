// @ts-nocheck

import {EventEmitter} from "events";
import {TaskFunction, ClusterOptionsArgument} from "puppeteer-cluster/dist/Cluster";

// hacky solution to get around Cluster.d.ts private fields
export default class Cluster<JobData = any, ReturnData = any> extends EventEmitter {
    static CONCURRENCY_PAGE: number;
    static CONCURRENCY_CONTEXT: number;
    static CONCURRENCY_BROWSER: number;
    public options;
    public perBrowserOptions;
    public workers;
    public workersAvail;
    public workersBusy;
    public workersStarting;
    public allTargetCount;
    public jobQueue;
    public errorCount;
    public taskFunction;
    public idleResolvers;
    public waitForOneResolvers;
    public browser;
    public isClosed;
    public startTime;
    public nextWorkerId;
    public monitoringInterval;
    public display;
    public duplicateCheckUrls;
    public lastDomainAccesses;
    public systemMonitor;
    public checkForWorkInterval;
    static launch(options: ClusterOptionsArgument): Promise<Cluster<any, any>>;
    public constructor();
    public init;
    public launchWorker;
    task(taskFunction: TaskFunction<JobData, ReturnData>): Promise<void>;
    public nextWorkCall;
    public workCallTimeout;
    public work;
    public doWork;
    public lastLaunchedWorkerTime;
    public allowedToStartWorker;
    public isTaskFunction;
    public queueJob;
    queue(data: JobData, taskFunction?: TaskFunction<JobData, ReturnData>): Promise<void>;
    queue(taskFunction: TaskFunction<JobData, ReturnData>): Promise<void>;
    execute(data: JobData, taskFunction?: TaskFunction<JobData, ReturnData>): Promise<ReturnData>;
    execute(taskFunction: TaskFunction<JobData, ReturnData>): Promise<ReturnData>;
    idle(): Promise<void>;
    waitForOne(): Promise<JobData>;
    close(): Promise<void>;
    public monitor;
}
