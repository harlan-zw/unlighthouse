import { assertType, describe, expect, expectTypeOf, it } from "vitest"
import { ciReporter } from "../src/reporter"
import { ResolvedUserConfig } from "@unlighthouse/core"
import { lighthouseReport } from "./__fixtures__/lighthouseReport"
import { CiRouteReport, V1Report } from "../src/types"

const sampleReport = {}

describe("reporter", () => {
  it("generates initial format when v1Report is not set", () => {
    const config = {} as ResolvedUserConfig

    const actual = ciReporter(config, lighthouseReport) as CiRouteReport[]
    expect(actual[0].path).toBeDefined()
    expect(actual[0].score).toBeDefined()
  })

  it("has basic information for v1 report", () => {
    const config = {
      ci: {
        v1Report: true,
      },
    } as ResolvedUserConfig

    const actual = ciReporter(config, lighthouseReport) as V1Report
    expect(actual.summary).toBeDefined()
    expect(actual.summary.score).toBeDefined()
    expect(actual.routes[0].path).toBeDefined()
    expect(actual.routes[0].score).toBeDefined()
  })

  it("has category information for v1 report", () => {
    const config = {
      ci: {
        v1Report: true,
      },
    } as ResolvedUserConfig

    const actual = ciReporter(config, lighthouseReport) as V1Report
    expect(actual.summary.categories).toBeDefined()
    expect(actual.summary.categories.performance).toBeDefined()
    expect(actual.summary.categories.accessibility).toBeDefined()
    expect(actual.summary.categories.seo).toBeDefined()
    expect(actual.summary.categories["best-practices"]).toBeDefined()
    expect(actual.routes[0].categories).toBeDefined()
    expect(actual.routes[0].categories.performance).toBeDefined()
    expect(actual.routes[0].categories.accessibility).toBeDefined()
    expect(actual.routes[0].categories.seo).toBeDefined()
    expect(actual.routes[0].categories["best-practices"]).toBeDefined()
  })

  it("has metrics information for v1 report", () => {
    const config = {
      ci: {
        v1Report: true,
      },
    } as ResolvedUserConfig


    const actual = ciReporter(config, lighthouseReport) as V1Report
    expect(actual.summary.metrics).toBeDefined()
    expect(actual.summary.metrics["largest-contentful-paint"]).toBeDefined()
    expect(actual.summary.metrics["cumulative-layout-shift"]).toBeDefined()
    expect(actual.summary.metrics["first-contentful-paint"]).toBeDefined()
    expect(actual.summary.metrics["total-blocking-time"]).toBeDefined()
    expect(actual.summary.metrics["max-potential-fid"]).toBeDefined()
    expect(actual.summary.metrics["interactive"]).toBeDefined()
    expect(actual.routes[0].metrics).toBeDefined()
    expect(actual.routes[0].metrics["largest-contentful-paint"]).toBeDefined()
    expect(actual.routes[0].metrics["cumulative-layout-shift"]).toBeDefined()
    expect(actual.routes[0].metrics["first-contentful-paint"]).toBeDefined()
    expect(actual.routes[0].metrics["total-blocking-time"]).toBeDefined()
    expect(actual.routes[0].metrics["max-potential-fid"]).toBeDefined()
    expect(actual.routes[0].metrics["interactive"]).toBeDefined()
  })
})
