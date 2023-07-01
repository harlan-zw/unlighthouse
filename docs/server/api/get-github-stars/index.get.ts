import { getQuery } from 'h3'
import type { GitHubRepo } from '../../../types'
import { cachedGitHubRepo } from '#imports'

export default defineEventHandler(async (event) => {
  const repoWithOwner = getQuery(event).repo

  if (!repoWithOwner)
    return sendError(event, new Error('Missing repo name.'))

  // use ungh to fetch the statrs
  const repo = await cachedGitHubRepo(repoWithOwner).catch({ stars: 0 }) as GitHubRepo
  return repo.stars
})
