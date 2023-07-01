import { cachedFunction } from '#imports'

export const cachedGitHubRepo = cachedFunction(async (repo: string) => {
  return (await $fetch(`https://ungh.cc/repos/${repo}`)).repo
}, {
  maxAge: 60 * 60,
  name: 'github-repo',
  getKey: (repo: string) => repo,
})
