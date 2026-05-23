# @unlighthouse/github-action

Composite GitHub Action wrapper around [`unlighthouse-ci`](https://unlighthouse.dev/integrations/ci).

- Runs a multi-device scan via the `--device` matrix flag (mobile, desktop, or both).
- On `pull_request` events, posts the `compare.markdown` PR-comment summary against a prior scan / branch.
- Exits non-zero when regressions or budget assertions trip, so the workflow fails the same way local CI does.

## Usage

```yaml
# .github/workflows/perf.yml
name: Unlighthouse
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: harlan-zw/unlighthouse/packages/github-action@v1
        with:
          site: https://example.com
          device: mobile,desktop
          compare-with: latest
```

## Inputs

| Input               | Default               | Description                                                                  |
| ------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `site`              | —                     | Required. URL to scan.                                                       |
| `device`            | `mobile`              | `mobile`, `desktop`, or comma-separated list (`mobile,desktop`).             |
| `budget`            | —                     | Minimum score (1-100); forwarded to `--budget`.                              |
| `build-static`      | `false`               | Also build a static report (`--build-static`).                               |
| `compare-with`      | `''`                  | `latest`, `<scanId>`, or `<branch>`. Empty = no comparison.                  |
| `comment-on-pr`     | `true`                | When the event is `pull_request`, POST the comparison Markdown as a comment. |
| `working-directory` | `.`                   | Where the scan is executed from.                                             |
| `github-token`      | `${{ github.token }}` | Token used to post the PR comment. Needs `pull-requests: write`.             |

## Outputs

| Output                  | Description                                                                |
| ----------------------- | -------------------------------------------------------------------------- |
| `has-regressions`       | `true` when comparison detected regressions (CLI exited non-zero).         |
| `compare-markdown-path` | Path of the rendered Markdown summary (empty when no comparison ran).      |
