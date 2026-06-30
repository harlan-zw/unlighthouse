// Public entry — re-exports the pure helpers that the composite-action
// entrypoint (`src/main.ts`) wires together. Keeping them exported lets us
// unit-test the shell-command builder and PR-comment payload shape without
// spawning `unlighthouse-ci`.

export interface ActionInputs {
  site: string
  device: string
  unlighthouseVersion: string
  budget?: string
  buildStatic: boolean
  compareWith: string
  commentOnPr: boolean
  workingDirectory: string
}

export interface ActionOutputs {
  hasRegressions: boolean
  compareMarkdownPath: string
}

/**
 * Parse the boolean-ish strings GitHub Actions sends via `env:` (always
 * strings, even when `default: false`). Treats the empty string and the
 * literal `'false'` / `'0'` / `'no'` as `false`; everything else truthy.
 */
export function parseBooleanInput(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null)
    return fallback
  const v = raw.trim().toLowerCase()
  if (v === '')
    return fallback
  return !(v === 'false' || v === '0' || v === 'no')
}

/**
 * Build the argv that should be passed to `unlighthouse-ci`. Returned as a
 * tuple so the caller can spawn without going through a shell — preserves
 * arg boundaries even when `site` contains spaces or shell metacharacters.
 *
 * `--compare` defaults to `latest` when `compareWith` is non-empty (matches
 * the CLI's own default). When `compareWith` is set, a `--compare-output`
 * path is appended so the comparison markdown is written to disk where the
 * PR-comment poster can pick it up.
 */
export function buildCliArgs(inputs: ActionInputs, compareOutputPath: string | null): string[] {
  const args: string[] = ['--site', inputs.site, '--no-open']

  if (inputs.device && inputs.device.trim() !== '')
    args.push('--device', inputs.device.trim())

  if (inputs.budget && inputs.budget.trim() !== '')
    args.push('--budget', inputs.budget.trim())

  if (inputs.buildStatic)
    args.push('--build-static')

  if (inputs.compareWith && inputs.compareWith.trim() !== '') {
    args.push('--compare', inputs.compareWith.trim())
    if (compareOutputPath)
      args.push('--compare-output', compareOutputPath)
  }

  return args
}

export function buildNpxArgs(unlighthouseVersion: string | undefined, cliArgs: string[]): string[] {
  const version = unlighthouseVersion?.trim() || 'latest'
  return ['--yes', '--package', `unlighthouse@${version}`, 'unlighthouse-ci', ...cliArgs]
}

/**
 * Build the request the action makes to `POST /repos/{owner}/{repo}/issues/{n}/comments`.
 * Kept as a pure function so tests can lock the wire shape without hitting
 * the live GitHub API.
 */
export function buildPrCommentRequest(opts: {
  repository: string // "owner/repo"
  prNumber: number
  body: string
  token: string
}): { url: string, init: { method: string, headers: Record<string, string>, body: string } } {
  const url = `https://api.github.com/repos/${opts.repository}/issues/${opts.prNumber}/comments`
  return {
    url,
    init: {
      method: 'POST',
      headers: {
        'accept': 'application/vnd.github+json',
        'authorization': `Bearer ${opts.token}`,
        'content-type': 'application/json',
        'user-agent': 'unlighthouse-github-action',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ body: opts.body }),
    },
  }
}

/**
 * Extract the PR number from a GitHub Actions event payload. Supports
 * `pull_request` and `pull_request_target` shapes. Returns `null` for
 * unsupported events (the caller logs and skips PR commenting in that case).
 */
export function extractPrNumber(eventName: string | undefined, payload: unknown): number | null {
  if (eventName !== 'pull_request' && eventName !== 'pull_request_target')
    return null
  if (!payload || typeof payload !== 'object')
    return null
  const pr = (payload as { pull_request?: { number?: number }, number?: number }).pull_request
  const n = pr?.number ?? (payload as { number?: number }).number
  return typeof n === 'number' ? n : null
}
