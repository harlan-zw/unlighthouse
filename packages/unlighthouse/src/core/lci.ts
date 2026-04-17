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
import type { UnlighthouseReport } from '../types'

export interface LciUploadOptions {
  host: string
  buildToken: string
  auth?: string
}

export async function uploadToLci(reports: UnlighthouseReport[], options: LciUploadOptions) {
  const api = new ApiClient({
    fetch,
    rootURL: options.host,
    basicAuth: (typeof options.auth === 'string' && options.auth.includes(':'))
      ? { username: options.auth.split(':')[0], password: options.auth.split(':')[1] }
      : undefined,
  })
  api.setBuildToken(options.buildToken)
  const project = await api.findProjectByToken(options.buildToken)
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
    if (!report.raw)
        continue

    await api.createRun({
      projectId: project.id,
      buildId: build.id,
      representative: false,
      url: report.url,
      lhr: JSON.stringify(report.raw),
    })
  }
  await api.sealBuild(build.projectId, build.id)
}
