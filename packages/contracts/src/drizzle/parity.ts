// Compile-time guard that the drizzle tables in `./sqlite` stay aligned with
// the contract atoms in `../types/atoms`. Drift here is a TypeScript build
// error, not a runtime surprise.
//
// Two normalization steps before comparing:
//   - Storage-private columns (`scans.createdAtMs`) are excluded; they have
//     no contract counterpart.
//   - Branded contract primitives (`ScanId`, `Url`, etc.) collapse to their
//     underlying primitive. Drizzle stores raw strings; brands belong to the
//     transport layer and are re-applied by the row→atom mapper.
import type { ExtractedMetrics, Scan, ScanRoute } from '../types/atoms'
import type { ScanRouteRow, ScanRow } from './sqlite'

type Equal<A, B>
  = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false

type Expect<T extends true> = T

// Strip Zod's `$brand` from primitive fields so brand-vs-plain doesn't show
// up as drift. The runtime mapper re-applies the brand on read.
type Unbrand<T>
  = T extends string ? string
    : T extends number ? number
      : T extends boolean ? boolean
        : T extends null ? null
          : T extends undefined ? undefined
            : T extends Array<infer U> ? Array<Unbrand<U>>
              : T extends object ? { [K in keyof T]: Unbrand<T[K]> }
                : T

// Zod `.optional()` adds `| undefined`; drizzle nullable columns infer as
// `T | null`. Normalize so both sides agree on absence representation.
type NormalizeOptional<T> = {
  [K in keyof T]-?: undefined extends T[K]
    ? Exclude<T[K], undefined> | null
    : T[K]
}

type Normalize<T> = NormalizeOptional<Unbrand<T>>

type StoragePrivateScanFields = 'createdAtMs'
type ScanRowPublic = Omit<ScanRow, StoragePrivateScanFields>

type _AssertScanShape = Expect<Equal<Normalize<ScanRowPublic>, Normalize<Scan>>>

type _AssertScanRouteShape = Expect<Equal<Normalize<ScanRouteRow>, Normalize<ScanRoute>>>

// Inputs to put-batch are ExtractedMetrics; the row adds scanId + device +
// blob keys. D-029 added device to the row identity; it's not on
// ExtractedMetrics (callers pass it as a separate arg to putBatch/upsert).
type _AssertExtractedMetricsShape = Expect<
  Equal<
    Normalize<Omit<ScanRouteRow, 'scanId' | 'device' | 'lhrBlobKey' | 'reportBlobKey'>>,
    Normalize<ExtractedMetrics>
  >
>
