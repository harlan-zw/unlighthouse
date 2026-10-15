# Unlighthouse

Site-wide Lighthouse scanner on Bun. Read `docs/architecture.md` before changing anything; it is the plan. `src/contracts.ts` and `src/types.ts` are the shared interfaces between modules: implement them as written; change them only together with every user of the change.

## Commands

- `bun install --frozen-lockfile`
- `bun run check` — typecheck (TypeScript 7, strict) and all tests. Must pass before every commit.
- `bun test test/<file>.test.ts` — one test file.
- `bun src/cli.ts <command>` — run the CLI.

## Rules

- Bun only: `bun`, `bun test`, `bunx`. No npm, pnpm, yarn, node, vitest, jest.
- Prefer Bun built-ins (`bun:sqlite`, `Bun.serve`, `HTMLRewriter`, `Bun.spawn`, `Bun.gzipSync`, `Bun.Glob`, `node:util` `parseArgs`). Adding a dependency needs the project owner's approval; dependencies are pinned exactly and `trustedDependencies` stays empty.
- `erasableSyntaxOnly` is on: no enums, namespaces or constructor parameter properties.
- `exactOptionalPropertyTypes` is on: do not assign `undefined` to an optional property; omit it.
- Imports use explicit `.ts` extensions; type-only imports use `import type`.
- No comments unless the code cannot say it (an outside system's odd behaviour, a constraint that looks wrong).
- Errors that callers handle are `UnlighthouseError` with a code from `src/errors.ts`.
- Lighthouse output is read only in `src/audit/reconcile.ts`.
- Tests verify behaviour through public functions. Network tests use a local `Bun.serve` fixture, never the internet; tests that need Chrome are skipped when `CHROME_PATH` and the default Chrome are both missing.
- Everything in the repo is English.

## Orchestration and cost

- The orchestrator plans, writes briefs and reviews; agents write the code. Agents run on Sonnet
  at `medium`. The orchestrator passes `model: opus` for design, architecture, the contract, money or
  concurrency, and a bug whose cause is unclear; a bug fix in existing code gets `effort: high`.
- A brief names the goal, the files, the check to run, what is out of scope, and asks for a final
  message of at most 300 words; long output goes to a file under /tmp and is referenced by path.
- Agents run in parallel only on independent work; dependent steps of one feature run in order.
- Changes to money, concurrency, migrations, the contract or permissions are reviewed in a fresh
  context (`/code-review`) before commit; only findings that affect correctness are fixed.
- One feature per session: a large piece of work gets a spec file and is built in a fresh session.

# Compact instructions

Keep the list of changed files, open bugs, the checks that ran and their results, and the decisions
taken; drop tool output.
