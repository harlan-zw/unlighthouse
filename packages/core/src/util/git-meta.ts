// Best-effort git metadata read. Used when a CLI / MCP caller hasn't passed
// an explicit `ciBuild` block on scan.start — without this, every local scan
// lands with `ciBranch: null` and compare.run can't tell a "rerun on the same
// commit" apart from a "regression on a new commit".
//
// All errors are swallowed: this is a convenience layer, not a contract.
// Returns null fields when run outside a git repo, on a detached HEAD, or
// anywhere git isn't on PATH.

export interface GitMeta {
  branch: string | null
  commit: string | null
  message: string | null
}

function gitOutput(args: string[], cwd: string): string | null {
  try {
    // `node:child_process` is resolved lazily, NOT as a top-level import, so
    // this module stays loadable in a browser bundle. The static client
    // (api/static-client) imports the handler barrel — and thus this file —
    // transitively, but never calls readGitMeta. A top-level
    // `import … from 'node:child_process'` makes Vite externalise the builtin
    // and the browser stub has no `execFileSync` export, crashing app boot.
    // process.getBuiltinModule (Node ≥20.16/22.3) returns it synchronously so
    // readGitMeta stays sync for its server-side callers.
    const { execFileSync } = process.getBuiltinModule('node:child_process')
    const out = execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 1500,
    }).trim()
    return out || null
  }
  catch {
    return null
  }
}

export function readGitMeta(cwd: string = process.cwd()): GitMeta {
  const branchRaw = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  // 'HEAD' means detached — treat as no branch.
  const branch = branchRaw && branchRaw !== 'HEAD' ? branchRaw : null
  const commit = gitOutput(['rev-parse', 'HEAD'], cwd)
  const message = gitOutput(['log', '-1', '--pretty=%s'], cwd)
  return { branch, commit, message }
}
