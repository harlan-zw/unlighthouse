// This is just the lighthouse types, we can't use them directly from node_modules as they aren't exported correctly

declare module 'lighthouse' {

  namespace LH {

    export interface Flags extends SharedFlagsSettings {
      /** The port to use for the debugging protocol, if manually connecting. */
      port?: number
      /** The hostname to use for the debugging protocol, if manually connecting. */
      hostname?: string
      /** The level of logging to enable. */
      logLevel?: 'silent' | 'error' | 'info' | 'verbose'
      /** The path to the config JSON. */
      configPath?: string
      /** Run the specified plugins. */
      plugins?: string[]
    }

    export interface Environment {
      /** The user agent string of the version of Chrome used. */
      hostUserAgent: string
      /** The user agent string that was sent over the network. */
      networkUserAgent: string
      /** The benchmark index number that indicates rough device class. */
      benchmarkIndex: number
      /** The version of libraries with which these results were generated. Ex: axe-core. */
      credits: Record<string, string>
    }

    /**
     * The full output of a Lighthouse run.
     */
    export interface Result {
      /** The URL that was supplied to Lighthouse and initially navigated to. */
      requestedUrl: string
      /** The post-redirects URL that Lighthouse loaded. */
      finalUrl: string
      /** The ISO-8601 timestamp of when the results were generated. */
      fetchTime: string
      /** The version of Lighthouse with which these results were generated. */
      lighthouseVersion: string
      /** An object containing the results of the audits, keyed by the audits' `id` identifier. */
      audits: Record<string, Audit.Result>
      /** The top-level categories, their overall scores, and member audits. */
      categories: Record<string, Result.Category>
      /** Descriptions of the groups referenced by CategoryMembers. */
      categoryGroups?: Record<string, Result.ReportGroup>

      /** List of top-level warnings for this Lighthouse run. */
      runWarnings: string[]
      /** A top-level error message that, if present, indicates a serious enough problem that this Lighthouse result may need to be discarded. */
      runtimeError?: { code: string; message: string }
      /** The User-Agent string of the browser used run Lighthouse for these results. */
      userAgent: string
      /** Information about the environment in which Lighthouse was run. */
      environment: Environment
      /** Execution timings for the Lighthouse run */
      timing: Result.Timing
      /** An array containing the result of all stack packs. */
      stackPacks?: Result.StackPack[]
    }

    // Result namespace
    export namespace Result {
      export interface Timing {
        entries: Artifacts.MeasureEntry[]
        total: number
      }

      export interface AuditRef {
        /** Matches the `id` of an Audit.Result. */
        id: string
        /** The weight of the audit's score in the overall category score. */
        weight: number
        /** Optional grouping within the category. Matches the key of a Result.Group. */
        group?: string
        /** The conventional acronym for the audit/metric. */
        acronym?: string
        /** Any audit IDs closely relevant to this one. */
        relevantAudits?: string[]
      }

      export interface Category {
        /** The string identifier of the category. */
        id: string
        /** The human-friendly name of the category */
        title: string
        /** A more detailed description of the category and its importance. */
        description?: string
        /** A description for the manual audits in the category. */
        manualDescription?: string
        /** The overall score of the category, the weighted average of all its audits. */
        score: number | null
        /** An array of references to all the audit members of this category. */
        auditRefs: AuditRef[]
      }

      export interface ReportGroup {
        /** The title of the display group. */
        title: string
        /** A brief description of the purpose of the display group. */
        description?: string
      }

      /**
       * A pack of secondary audit descriptions to be used when a page uses a
       * specific technology stack, giving stack-specific advice for some of
       * Lighthouse's audits.
       */
      export interface StackPack {
        /** The unique string ID for this stack pack. */
        id: string
        /** The title of the stack pack, to be displayed in the report. */
        title: string
        /** A base64 data url to be used as the stack pack's icon. */
        iconDataURL: string
        /** A set of descriptions for some of Lighthouse's audits, keyed by audit `id`. */
        descriptions: Record<string, string>
      }
    }
  }

  namespace LH {
    // re-export useful type modules under global LH module.

    /** Simulation settings that control the amount of network & cpu throttling in the run. */
    interface ThrottlingSettings {
      /** The round trip time in milliseconds. */
      rttMs?: number
      /** The network throughput in kilobits per second. */
      throughputKbps?: number
      // devtools settings
      /** The network request latency in milliseconds. */
      requestLatencyMs?: number
      /** The network download throughput in kilobits per second. */
      downloadThroughputKbps?: number
      /** The network upload throughput in kilobits per second. */
      uploadThroughputKbps?: number
      // used by both
      /** The amount of slowdown applied to the cpu (1/<cpuSlowdownMultiplier>). */
      cpuSlowdownMultiplier?: number
    }

    export interface PrecomputedLanternData {
      additionalRttByOrigin: Record<string, number>
      serverResponseTimeByOrigin: Record<string, number>
    }

    export type Locale =
      'en-US'
      | 'en'
      | 'en-AU'
      | 'en-GB'
      | 'en-IE'
      | 'en-SG'
      | 'en-ZA'
      | 'en-IN'
      | 'ar-XB'
      | 'ar'
      | 'bg'
      | 'ca'
      | 'cs'
      | 'da'
      | 'de'
      | 'el'
      | 'en-XA'
      | 'en-XL'
      | 'es'
      | 'es-419'
      | 'es-AR'
      | 'es-BO'
      | 'es-BR'
      | 'es-BZ'
      | 'es-CL'
      | 'es-CO'
      | 'es-CR'
      | 'es-CU'
      | 'es-DO'
      | 'es-EC'
      | 'es-GT'
      | 'es-HN'
      | 'es-MX'
      | 'es-NI'
      | 'es-PA'
      | 'es-PE'
      | 'es-PR'
      | 'es-PY'
      | 'es-SV'
      | 'es-US'
      | 'es-UY'
      | 'es-VE'
      | 'fi'
      | 'fil'
      | 'fr'
      | 'he'
      | 'hi'
      | 'hr'
      | 'hu'
      | 'gsw'
      | 'id'
      | 'in'
      | 'it'
      | 'iw'
      | 'ja'
      | 'ko'
      | 'lt'
      | 'lv'
      | 'mo'
      | 'nl'
      | 'nb'
      | 'no'
      | 'pl'
      | 'pt'
      | 'pt-PT'
      | 'ro'
      | 'ru'
      | 'sk'
      | 'sl'
      | 'sr'
      | 'sr-Latn'
      | 'sv'
      | 'ta'
      | 'te'
      | 'th'
      | 'tl'
      | 'tr'
      | 'uk'
      | 'vi'
      | 'zh'
      | 'zh-HK'
      | 'zh-TW'

    export type OutputMode = 'json' | 'html' | 'csv'

    export interface ScreenEmulationSettings {
      /** Overriding width value in pixels (minimum 0, maximum 10000000). 0 disables the override. */
      width: number
      /** Overriding height value in pixels (minimum 0, maximum 10000000). 0 disables the override. */
      height: number
      /** Overriding device scale factor value. 0 disables the override. */
      deviceScaleFactor: number
      /** Whether to emulate mobile device. This includes viewport meta tag, overlay scrollbars, text autosizing and more. */
      mobile: boolean
      /** Whether screen emulation is disabled. If true, the other emulation settings are ignored. */
      disabled: boolean
    }

    /**
     * Options that are found in both the flags used by the Lighthouse module
     * interface and the Config's `settings` object.
     */
    interface SharedFlagsSettings {
      /** The type(s) of report output to be produced. */
      output?: OutputMode | OutputMode[]
      /** The locale to use for the output. */
      locale?: Locale
      /** The maximum amount of time to wait for a page content render, in ms. If no content is rendered within this limit, the run is aborted with an error. */
      maxWaitForFcp?: number
      /** The maximum amount of time to wait for a page to load, in ms. */
      maxWaitForLoad?: number
      /** List of URL patterns to block. */
      blockedUrlPatterns?: string[] | null
      /** Comma-delimited list of trace categories to include. */
      additionalTraceCategories?: string | null
      /** Flag indicating the run should only audit. */
      auditMode?: boolean | string
      /** Flag indicating the run should only gather. */
      gatherMode?: boolean | string
      /** Flag indicating that the browser storage should not be reset for the audit. */
      disableStorageReset?: boolean

      /** How Lighthouse should interpret this run in regards to scoring performance metrics and skipping mobile-only tests in desktop. Must be set even if throttling/emulation is being applied outside of Lighthouse. */
      formFactor?: 'mobile' | 'desktop'
      /** Screen emulation properties (width, height, dpr, mobile viewport) to apply or an object of `{disabled: true}` if Lighthouse should avoid applying screen emulation. If either emulation is applied outside of Lighthouse, or it's being run on a mobile device, it typically should be set to disabled. For desktop, we recommend applying consistent desktop screen emulation. */
      screenEmulation?: Partial<ScreenEmulationSettings>
      /** User Agent string to apply, `false` to not change the host's UA string, or `true` to use Lighthouse's default UA string. */
      emulatedUserAgent?: string | boolean

      /** The method used to throttle the network. */
      throttlingMethod?: 'devtools' | 'simulate' | 'provided'
      /** The throttling config settings. */
      throttling?: ThrottlingSettings
      /** If present, the run should only conduct this list of audits. */
      onlyAudits?: string[] | null
      /** If present, the run should only conduct this list of categories. */
      onlyCategories?: string[] | null
      /** If present, the run should skip this list of audits. */
      skipAudits?: string[] | null
      /** How Lighthouse was run, e.g. from the Chrome extension or from the npm module */
      channel?: string
      /** Precomputed lantern estimates to use instead of observed analysis. */
      precomputedLanternData?: PrecomputedLanternData | null
      /** The budget.json object for LightWallet. */
      budgets?: Array<Budget> | null
      /** Optional extra headers */
      extraHeaders?: { [key: string]: string }
    }

    /**
     * Extends the flags in SharedFlagsSettings with flags used to configure the
     * Lighthouse module but will not end up in the Config settings.
     */
    export interface Flags extends SharedFlagsSettings {
      /** The port to use for the debugging protocol, if manually connecting. */
      port?: number
      /** The hostname to use for the debugging protocol, if manually connecting. */
      hostname?: string
      /** The level of logging to enable. */
      logLevel?: 'silent' | 'error' | 'info' | 'verbose'
      /** The path to the config JSON. */
      configPath?: string
      /** Run the specified plugins. */
      plugins?: string[]
    }

    /**
     * Extends the flags accepted by the Lighthouse module with additional flags
     * used just for controlling the CLI.
     */
    export interface CliFlags extends Flags {
      _: string[]
      chromeIgnoreDefaultFlags: boolean
      chromeFlags: string | string[]
      /** Output path for the generated results. */
      outputPath?: string
      /** Flag to save the trace contents and screenshots to disk. */
      saveAssets: boolean
      /** Flag to open the report immediately. */
      view: boolean
      /** Flag to enable error reporting. */
      enableErrorReporting?: boolean
      /** Flag to print a list of all audits + categories. */
      listAllAudits: boolean
      /** Flag to print a list of all required trace categories. */
      listTraceCategories: boolean
      /** A preset audit of selected audit categories to run. */
      preset?: 'experimental' | 'perf' | 'desktop'
      /** A flag to enable logLevel 'verbose'. */
      verbose: boolean
      /** A flag to enable logLevel 'silent'. */
      quiet: boolean
      /** A flag to print the normalized config for the given config and options, then exit. */
      printConfig: boolean
      /** Path to the file where precomputed lantern data should be read from. */
      precomputedLanternDataPath?: string
      /** Path to the file where precomputed lantern data should be written to. */
      lanternDataOutputPath?: string
      /** Path to the budget.json file for LightWallet. */
      budgetPath?: string | null

      // The following are given defaults in cli-flags, so are not optional like in Flags or SharedFlagsSettings.
      output: OutputMode[]
      port: number
      hostname: string
    }

    export interface RunnerResult {
      lhr: Result
      report: string | string[]
      artifacts: Artifacts
    }

    export interface ReportAudit {
      id: string
      weight: number
      group: string
    }

    export interface ReportCategory {
      name: string
      description: string
      audits: ReportAudit[]
    }

    /**
     * A record of DevTools Debugging Protocol events.
     */
    export type DevtoolsLog = Array<Protocol.RawEventMessage>

    /** The type of the Profile & ProfileChunk event in Chromium traces. Note that this is subtly different from Crdp.Profiler.Profile. */
    export interface TraceCpuProfile {
      nodes?: Array<{ id: number; callFrame: { functionName: string; url?: string }; parent?: number }>
      samples?: Array<number>
      timeDeltas?: Array<number>
    }

    /**
     * @see https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
     */
    export interface TraceEvent {
      name: string
      cat: string
      args: {
        fileName?: string
        snapshot?: string
        sync_id?: string
        beginData?: {
          frame?: string
          startLine?: number
          url?: string
        }
        data?: {
          frame?: string
          isLoadingMainFrame?: boolean
          documentLoaderURL?: string
          frames?: {
            frame: string
            parent?: string
            processId?: number
          }[]
          page?: string
          readyState?: number
          requestId?: string
          startTime?: number
          timeDeltas?: TraceCpuProfile['timeDeltas']
          cpuProfile?: TraceCpuProfile
          callFrame?: Required<TraceCpuProfile>['nodes'][0]['callFrame']
          /** Marker for each synthetic CPU profiler event for the range of _potential_ ts values. */
          _syntheticProfilerRange?: {
            earliestPossibleTimestamp: number
            latestPossibleTimestamp: number
          }
          stackTrace?: {
            url: string
          }[]
          styleSheetUrl?: string
          timerId?: string
          url?: string
          is_main_frame?: boolean
          cumulative_score?: number
          id?: string
          nodeId?: number
          impacted_nodes?: Array<{
            node_id: number
            old_rect?: Array<number>
            new_rect?: Array<number>
          }>
          score?: number
          weighted_score_delta?: number
          had_recent_input?: boolean
          compositeFailed?: number
          unsupportedProperties?: string[]
          size?: number
        }
        frame?: string
        name?: string
        labels?: string
      }
      pid: number
      tid: number
      /** Timestamp of the event in microseconds. */
      ts: number
      dur: number
      ph: 'B' | 'b' | 'D' | 'E' | 'e' | 'F' | 'I' | 'M' | 'N' | 'n' | 'O' | 'R' | 'S' | 'T' | 'X'
      s?: 't'
      id?: string
      id2?: {
        local?: string
      }
    }

    export interface Trace {
      traceEvents: TraceEvent[]
      metadata?: {
        'cpu-family'?: number
      }

      [futureProps: string]: any
    }

    export interface DevToolsJsonTarget {
      description: string
      devtoolsFrontendUrl: string
      id: string
      title: string
      type: string
      url: string
      webSocketDebuggerUrl: string
    }
  }

  interface Window {
    // Cached native functions/objects for use in case the page overwrites them.
    // See: `executionContext.cacheNativesOnNewDocument`.
    __nativePromise: PromiseConstructor
    __nativePerformance: Performance
    __nativeURL: typeof URL
    __ElementMatches: Element['matches']

    /** Used for monitoring long tasks in the test page. */
    ____lastLongTask?: number

    /** Used by FullPageScreenshot gatherer. */
    __lighthouseNodesDontTouchOrAllVarianceGoesAway: Map<Element, string>
    __lighthouseExecutionContextId?: number

    // Not defined in tsc yet: https://github.com/microsoft/TypeScript/issues/40807
    requestIdleCallback(callback: (deadline: { didTimeout: boolean; timeRemaining: () => DOMHighResTimeStamp }) => void, options?: { timeout: number }): number
  }

}
