// readGitMeta is best-effort: returns null fields when git isn't available
// or the cwd isn't a repo. The unit test covers the negative path (a tmp
// dir with no .git); the integration coverage that "this repo's HEAD shows
// up correctly" lives in the MCP scan_start test.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readGitMeta } from '@unlighthouse/core/util/git-meta'
import { describe, expect, it } from 'vitest'

describe('readGitMeta', () => {
  it('returns all-null when cwd is not a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uh-git-meta-'))
    try {
      const meta = readGitMeta(dir)
      expect(meta).toEqual({ branch: null, commit: null, message: null })
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads HEAD details from the current repo (this checkout)', () => {
    const meta = readGitMeta()
    // We can't assert exact values (varies per checkout), but this repo
    // always has a HEAD commit and a non-empty message.
    expect(meta.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(meta.message).not.toBeNull()
    expect(meta.message?.length).toBeGreaterThan(0)
    // Branch may be null on detached HEAD (e.g. in some CI runners), so
    // accept either a non-empty string or null.
    if (meta.branch !== null) {
      expect(meta.branch.length).toBeGreaterThan(0)
      expect(meta.branch).not.toBe('HEAD')
    }
  })
})
