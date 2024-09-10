import ApiClient from '@lhci/utils/src/api-client.js'
import {
  getAncestorHash,
  getAuthor,
  getAvatarUrl,
  getCommitMessage,
  getCommitTime,
  getCurrentBranch,
  getCurrentHash,
  getExternalBuildUrl,
} from '@lhci/utils/src/build-context.js'
import fs from 'fs-extra'
import { handleError } from '../errors'
import type { UnlighthouseRouteReport } from '../types'
import type { ReporterConfig } from './types'

export async function reportLighthouseServer(
  reports: UnlighthouseRouteReport[],
  { lhciBuildToken, lhciHost, lhciAuth }: ReporterConfig,
): Promise<void> {
  try {
    const api = new ApiClient({
      fetch,
      rootURL: lhciHost,
      basicAuth: (typeof lhciAuth === 'string' && lhciAuth.includes(':'))
        ? { username: lhciAuth.split(':')[0], password: lhciAuth.split(':')[1] }
        : undefined,
    })
    api.setBuildToken(lhciBuildToken)
    const project = await api.findProjectByToken(lhciBuildToken)
    const baseBranch = project.baseBranch || 'master'
    const hash = getCurrentHash()
    const branch = getCurrentBranch()
    const ancestorHash = getAncestorHash('HEAD', baseBranch)
    const build = await api.createBuild({
      projectId: project.id,
      lifecycle: 'unsealed',
      hash,
      branch,
      ancestorHash,
      commitMessage: getCommitMessage(hash),
      author: getAuthor(hash),
      avatarUrl: getAvatarUrl(hash),
      externalBuildUrl: getExternalBuildUrl(),
      runAt: new Date().toISOString(),
      committedAt: getCommitTime(hash),
      ancestorCommittedAt: ancestorHash
        ? getCommitTime(ancestorHash)
        : undefined,
    })

    for (const report of reports) {
      const lighthouseResult = await fs.readJson(
        `${report.artifactPath}/lighthouse.json`,
      )

      await api.createRun({
        projectId: project.id,
        buildId: build.id,
        representative: false,
        url: `${report.route.url}${report.route.path}`,
        lhr: JSON.stringify(lighthouseResult),
      })
    }
    await api.sealBuild(build.projectId, build.id)
  }
  catch (e) {
    handleError(e)
  }
}
