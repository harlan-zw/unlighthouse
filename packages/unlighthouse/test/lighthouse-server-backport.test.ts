import { describe, expect, it, vi } from 'vitest'
import reports from '../../../test/fixtures/lighthouseReport.mjs'
import { generateReportPayload } from '../src/reporters'

const boundary = vi.hoisted(() => ({ createRun: vi.fn(), finalUrl: 'https://example.com/final' }))
vi.mock('../src/runtime-download', () => ({ downloadDependencies: async () => (specifier: string) => specifier }))
vi.mock('node:fs/promises', () => ({ readFile: async () => JSON.stringify({ lighthouseVersion: '13.0.0', requestedUrl: 'https://example.com/start', finalUrl: boundary.finalUrl, categories: {}, audits: {} }) }))
// Constructors need a function expression so `new ApiClient()` works.
// eslint-disable-next-line prefer-arrow-callback
vi.mock('@lhci/utils/src/api-client.js', () => ({ default: vi.fn(function () {
  return {
    setBuildToken: vi.fn(),
    findProjectByToken: async () => ({ id: 1 }),
    createBuild: async () => ({ id: 1, projectId: 1 }),
    createRun: boundary.createRun,
    sealBuild: vi.fn(),
  }
}) }))
vi.mock('@lhci/utils/src/build-context.js', () => Object.fromEntries(['getAncestorHash', 'getAuthor', 'getAvatarUrl', 'getCommitMessage', 'getCommitTime', 'getCurrentBranch', 'getCurrentHash', 'getExternalBuildUrl'].map(key => [key, () => ''])))

describe('lighthouse server URL', () => {
  it.each(['https://example.com/final', ''])('uses the final URL or scanned URL: %s', async (finalUrl) => {
    boundary.finalUrl = finalUrl
    boundary.createRun.mockClear()
    await generateReportPayload('lighthouseServer', reports.slice(1, 2), { lhciHost: 'https://lhci.example.com', lhciBuildToken: 'token' })
    expect(boundary.createRun).toHaveBeenCalledWith(expect.objectContaining({ url: finalUrl || reports[1].route.url }))
  })
})
