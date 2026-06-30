import { describe, expect, it } from 'vitest'
import {
  buildCliArgs,
  buildNpxArgs,
  buildPrCommentRequest,
  extractPrNumber,
  parseBooleanInput,
} from '../src/index'

describe('parseBooleanInput', () => {
  it('treats `false`, `0`, `no`, empty as false; everything else truthy', () => {
    expect(parseBooleanInput('true', false)).toBe(true)
    expect(parseBooleanInput('TRUE', false)).toBe(true)
    expect(parseBooleanInput('1', false)).toBe(true)
    expect(parseBooleanInput('false', true)).toBe(false)
    expect(parseBooleanInput('0', true)).toBe(false)
    expect(parseBooleanInput('no', true)).toBe(false)
    expect(parseBooleanInput('', true)).toBe(true) // empty falls back
    expect(parseBooleanInput(undefined, false)).toBe(false)
  })
})

describe('buildCliArgs', () => {
  const base = {
    site: 'https://example.com',
    device: 'mobile',
    unlighthouseVersion: 'latest',
    buildStatic: false,
    compareWith: '',
    commentOnPr: false,
    workingDirectory: '.',
  }

  it('always emits `--site` and `--no-open`', () => {
    expect(buildCliArgs(base, null)).toEqual([
      '--site',
      'https://example.com',
      '--no-open',
      '--device',
      'mobile',
    ])
  })

  it('forwards a comma-separated device matrix verbatim', () => {
    const args = buildCliArgs({ ...base, device: 'mobile,desktop' }, null)
    expect(args).toContain('--device')
    expect(args[args.indexOf('--device') + 1]).toBe('mobile,desktop')
  })

  it('appends `--compare` + `--compare-output` only when `compareWith` is set', () => {
    const withCompare = buildCliArgs({ ...base, compareWith: 'latest' }, '/tmp/x.md')
    expect(withCompare).toContain('--compare')
    expect(withCompare[withCompare.indexOf('--compare') + 1]).toBe('latest')
    expect(withCompare).toContain('--compare-output')
    expect(withCompare[withCompare.indexOf('--compare-output') + 1]).toBe('/tmp/x.md')

    const noCompare = buildCliArgs(base, '/tmp/x.md')
    expect(noCompare).not.toContain('--compare')
    expect(noCompare).not.toContain('--compare-output')
  })

  it('forwards `--budget` and `--build-static`', () => {
    const args = buildCliArgs({ ...base, budget: '85', buildStatic: true }, null)
    expect(args).toContain('--budget')
    expect(args[args.indexOf('--budget') + 1]).toBe('85')
    expect(args).toContain('--build-static')
  })
})

describe('buildNpxArgs', () => {
  it('runs unlighthouse-ci from the requested package version', () => {
    expect(buildNpxArgs('0.17.7', ['--site', 'https://example.com'])).toEqual([
      '--yes',
      '--package',
      'unlighthouse@0.17.7',
      'unlighthouse-ci',
      '--site',
      'https://example.com',
    ])
  })

  it('defaults to latest when the version input is empty', () => {
    expect(buildNpxArgs('', [])).toEqual([
      '--yes',
      '--package',
      'unlighthouse@latest',
      'unlighthouse-ci',
    ])
  })
})

describe('buildPrCommentRequest', () => {
  it('targets the issues/<n>/comments endpoint and uses Bearer auth', () => {
    const req = buildPrCommentRequest({
      repository: 'harlan-zw/unlighthouse',
      prNumber: 365,
      body: '## hi',
      token: 't0k3n',
    })
    expect(req.url).toBe('https://api.github.com/repos/harlan-zw/unlighthouse/issues/365/comments')
    expect(req.init.method).toBe('POST')
    expect(req.init.headers.authorization).toBe('Bearer t0k3n')
    expect(req.init.headers['x-github-api-version']).toBe('2022-11-28')
    expect(JSON.parse(req.init.body)).toEqual({ body: '## hi' })
  })
})

describe('extractPrNumber', () => {
  it('reads `pull_request.number` for the `pull_request` event', () => {
    expect(extractPrNumber('pull_request', { pull_request: { number: 7 } })).toBe(7)
    expect(extractPrNumber('pull_request_target', { pull_request: { number: 9 } })).toBe(9)
  })

  it('falls back to top-level `number` when `pull_request` is absent', () => {
    expect(extractPrNumber('pull_request', { number: 12 })).toBe(12)
  })

  it('returns null for non-PR events or malformed payloads', () => {
    expect(extractPrNumber('push', { pull_request: { number: 1 } })).toBeNull()
    expect(extractPrNumber('pull_request', null)).toBeNull()
    expect(extractPrNumber(undefined, { pull_request: { number: 1 } })).toBeNull()
  })
})
