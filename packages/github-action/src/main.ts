// Entry point invoked by `action.yml`'s composite shell step. Reads inputs
// from `UNLIGHTHOUSE_*` env vars (set by the composite step), runs
// `unlighthouse-ci` via `npx`, then — if the workflow was triggered by a
// pull request and `comment-on-pr` is enabled — POSTs the rendered
// `compare.markdown` to the PR via the GitHub REST API.

import type { ActionInputs } from './index'
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { buildCliArgs, buildNpxArgs, buildPrCommentRequest, extractPrNumber, parseBooleanInput } from './index'

const actionOperationalLogger = {
  warn(message: unknown, meta?: unknown) {
    process.stderr.write(`::warning::${String(message)}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`)
  },
  error(message: unknown, meta?: unknown) {
    process.stderr.write(`::error::${String(message)}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`)
  },
}

function readInputs(): ActionInputs {
  const site = (process.env.UNLIGHTHOUSE_SITE ?? '').trim()
  if (!site) {
    process.stderr.write('::error::Input `site` is required.\n')
    process.exit(1)
  }
  return {
    site,
    device: process.env.UNLIGHTHOUSE_DEVICE ?? 'mobile',
    unlighthouseVersion: process.env.UNLIGHTHOUSE_VERSION ?? 'latest',
    budget: process.env.UNLIGHTHOUSE_BUDGET,
    buildStatic: parseBooleanInput(process.env.UNLIGHTHOUSE_BUILD_STATIC, false),
    compareWith: process.env.UNLIGHTHOUSE_COMPARE_WITH ?? '',
    commentOnPr: parseBooleanInput(process.env.UNLIGHTHOUSE_COMMENT_ON_PR, true),
    workingDirectory: process.cwd(),
  }
}

function writeOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT
  if (!file)
    return
  // Use a heredoc-style delimiter so multi-line / path values survive verbatim.
  const delim = `EOF_${Math.random().toString(36).slice(2)}`
  const line = `${name}<<${delim}\n${value}\n${delim}\n`
  appendFileSync(file, line, 'utf8')
}

async function runUnlighthouseCi(args: string[], unlighthouseVersion: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn('npx', buildNpxArgs(unlighthouseVersion, args), {
      stdio: 'inherit',
      env: process.env,
      shell: false,
    })
    child.on('error', reject)
    child.on('exit', code => resolve(code ?? 0))
  })
}

async function postPrComment(markdown: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  const eventName = process.env.GITHUB_EVENT_NAME
  const eventPath = process.env.GITHUB_EVENT_PATH

  if (!token) {
    process.stdout.write('::notice::Skipping PR comment — no `GITHUB_TOKEN` set.\n')
    return
  }
  if (!repository || !eventPath || !existsSync(eventPath)) {
    process.stdout.write('::notice::Skipping PR comment — workflow does not look like a GitHub Actions run.\n')
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(await readFile(eventPath, 'utf8'))
  }
  catch (err) {
    logOperationalWarn('github_action.pr_context_parse_failed', err, { eventPath }, actionOperationalLogger)
    return
  }

  const prNumber = extractPrNumber(eventName, payload)
  if (prNumber == null) {
    process.stdout.write(`::notice::Skipping PR comment — event \`${eventName}\` is not a pull request.\n`)
    return
  }

  const { url, init } = buildPrCommentRequest({ repository, prNumber, body: markdown, token })
  const res = await fetch(url, init)
  if (!res.ok) {
    let text = '<no body>'
    try {
      text = await res.text()
    }
    catch (err) {
      logOperationalWarn('github_action.response_body_read_failed', err, { status: res.status }, actionOperationalLogger)
    }
    process.stderr.write(`::error::Failed to post PR comment (HTTP ${res.status}): ${text}\n`)
    process.exit(1)
  }
  process.stdout.write(`Posted Unlighthouse comparison to PR #${prNumber}.\n`)
}

async function main(): Promise<void> {
  const inputs = readInputs()

  let compareOutputPath: string | null = null
  if (inputs.compareWith.trim() !== '') {
    const dir = await mkdtemp(join(tmpdir(), 'unlighthouse-action-'))
    compareOutputPath = join(dir, 'compare.md')
  }

  const args = buildCliArgs(inputs, compareOutputPath)
  process.stdout.write(`Running: npx ${buildNpxArgs(inputs.unlighthouseVersion, args).join(' ')}\n`)

  const exitCode = await runUnlighthouseCi(args, inputs.unlighthouseVersion)

  let hasRegressions = false
  if (compareOutputPath && existsSync(compareOutputPath)) {
    const markdown = await readFile(compareOutputPath, 'utf8')
    // CLI exits non-zero only when assertions or `--compare` regressions
    // tripped. We bubble that through `has-regressions` as well so callers
    // can branch in YAML without re-parsing the markdown.
    hasRegressions = exitCode !== 0
    writeOutput('has-regressions', String(hasRegressions))
    writeOutput('compare-markdown-path', compareOutputPath)

    if (inputs.commentOnPr)
      await postPrComment(markdown)
  }
  else {
    writeOutput('has-regressions', 'false')
    writeOutput('compare-markdown-path', '')
  }

  // Preserve the CI exit code — regressions / failing assertions must keep
  // failing the workflow even when we successfully posted a comment.
  process.exit(exitCode)
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err)
  process.stderr.write(`::error::${message}\n`)
  process.exit(1)
})
