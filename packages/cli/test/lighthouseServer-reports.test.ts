import { describe, expect, it, vi } from "vitest"
import type { UnlighthouseRouteReport } from "../src/types"
import { generateReportPayload } from "../src/reporters"
import _lighthouseReport from "./__fixtures__/lighthouseReport.mjs"
import fs from 'fs-extra'
import ApiClient from "@lhci/utils/src/api-client.js"
import { create } from "lodash-es"

const lighthouseReport = _lighthouseReport as any as UnlighthouseRouteReport[]

vi.mock("fs-extra", () => {
  return {
    default: {
      readJson: vi.fn(() => new Promise((resolve) => resolve({}))),
    },
  }
})

const setBuildToken = vi.fn()
const findProjectByToken = vi.fn(
  () => new Promise((resolve) => resolve({ id: 1 }))
)
const createBuild = vi.fn(
  () => new Promise((resolve) => resolve({ id: 1, projectId: 1 }))
)
const createRun = vi.fn(() => new Promise((resolve) => resolve({})))
const sealBuild = vi.fn(() => new Promise((resolve) => resolve({})))

vi.mock("@lhci/utils/src/api-client.js", () => {
  const ApiClient = vi.fn(() => ({
    setBuildToken,
    findProjectByToken,
    createBuild,
    createRun,
    sealBuild,
  }))
  return {
    default: ApiClient,
  }
})

vi.mock("@lhci/utils/src/build-context.js", () => {
  return {
    getCommitMessage: vi.fn( () => ''),
    getAuthor: vi.fn( () => ''),
    getAvatarUrl: vi.fn( () => ''),
    getExternalBuildUrl: vi.fn( () => ''),
    getCommitTime: vi.fn( () => ''),
    getCurrentHash: vi.fn( () => ''),
    getCurrentBranch: vi.fn( () => ''),
    getAncestorHash: vi.fn( () => ''),
  }
})

describe("lighthouseServer reports", () => {
  it("expanded",async () => {
    vi.useFakeTimers()

    await Promise.resolve<Promise<any>>( generateReportPayload("lighthouseServer", lighthouseReport, {
      lhciHost: "http://localhost",
      lhciBuildToken: "token",
    }))

    expect(ApiClient).toBeCalledWith({ fetch, rootURL: "http://localhost" })
    expect(setBuildToken).toBeCalledWith('token')

    expect(createBuild).toBeCalledWith({
      projectId: 1,
      lifecycle: "unsealed",
      hash: '',
      branch: '',
      ancestorHash: '',
      commitMessage:'',
      author: '',
      avatarUrl: '',
      externalBuildUrl: '',
      runAt: new Date().toISOString(),
      committedAt: '',
      ancestorCommittedAt: undefined
    })

    expect(fs.readJson).toBeCalledTimes(lighthouseReport.length)

    expect(createRun).toBeCalledTimes(lighthouseReport.length)

    lighthouseReport.forEach(({ route}) => {
      expect(createRun).toBeCalledWith({
        projectId: 1,
          buildId:1,
          representative: false,
          url: `${route.url}${route.path}`,
          lhr: '{}',
      })
    })

    expect(sealBuild).toBeCalledTimes(1)
    expect(sealBuild).toBeCalledWith(1,1)
  })
})
