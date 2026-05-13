declare module 'third-party-web' {
  const ThirdPartyWeb: any
  export default ThirdPartyWeb
}

declare module 'better-opn' {
  export default function open(target: string): Promise<void>
}

declare module '@lhci/utils/src/api-client.js' {
  interface ApiClientOptions {
    fetch: typeof fetch
    rootURL: string
    basicAuth?: { username?: string, password?: string }
  }

  export default class ApiClient {
    constructor(options: ApiClientOptions)
    setBuildToken(token: string): void
    findProjectByToken(token: string): Promise<{ id: string, baseBranch?: string }>
    createBuild(build: Record<string, unknown>): Promise<{ id: string, projectId: string }>
    createRun(run: Record<string, unknown>): Promise<unknown>
    sealBuild(projectId: string, buildId: string): Promise<unknown>
  }
}

declare module '@lhci/utils/src/build-context.js' {
  export function getAncestorHash(head: string, baseBranch: string): string | undefined
  export function getAuthor(hash: string): string | undefined
  export function getAvatarUrl(hash: string): string | undefined
  export function getCommitMessage(hash: string): string | undefined
  export function getCommitTime(hash: string): string | undefined
  export function getCurrentBranch(): string
  export function getCurrentHash(): string
  export function getExternalBuildUrl(): string | undefined
}
