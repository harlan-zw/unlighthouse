import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCiCli } from '../src/cli/ci'
import { parseRootArgs } from '../src/cli/createCli'
import { parseDevices, pickOptions, resolveCiReporter, validateHost } from '../src/cli/util'

afterEach(() => vi.unstubAllGlobals())

describe('host redirects', () => {
  it.each([
    ['https://www.example.com/about', 'https://www.example.com/about'],
    ['https://www.example.com/index.php', 'https://example.com'],
  ])('adopts a page redirect but skips a file: %s', async (target, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const response = new Response('ok')
      Object.defineProperty(response, 'url', { value: target })
      return response
    }))
    const config = { site: 'https://example.com', lighthouseOptions: {} } as Parameters<typeof validateHost>[0]
    await validateHost(config)
    expect(config.site).toBe(expected)
  })
})

// D-033: the CLI is now a citty projection of the command registry. The root
// command's flags parse to the same `CliOptions` the previous cac program
// produced; `parseRootArgs` is the citty parse + cac-compatible mapping.
// (Undocumented cac camelCase flag aliases like `--extraHeaders` are dropped in
// favour of the documented kebab `--extra-headers`.)
const args = (extra: string[]) => parseRootArgs(['--site', 'unlighthouse.dev', ...extra])

describe('cli args', () => {
  it.each(['--cache=false', '--no-cache'])('preserves explicit false for %s', (flag) => {
    expect(pickOptions(args([flag])).cache).toBe(false)
  })
  it('preserves explicit true cache assignments', () => {
    expect(pickOptions(args(['--cache=true'])).cache).toBe(true)
  })
  it.each(['--debug=false', '--no-debug'])('disables configured debug with %s', (flag) => {
    expect(pickOptions(args([flag])).debug).toBe(false)
  })
  it('lets an explicit reporter override disabled config', () => {
    expect(resolveCiReporter('csv', false)).toBe('csv')
  })
  it('leaves configured cache unchanged when CI receives no cache flag', () => {
    const options = createCiCli().parse(['node', 'ci', '--site', 'https://example.com']).options
    expect(pickOptions(options).cache).toBeUndefined()
  })

  it('preserves separators in credentials and tokens', () => {
    const picked = pickOptions(args(['--auth', 'user:pass:word', '--cookies', 'token=abc==', '--extra-headers', 'Authorization:Bearer abc==', '--default-query-params', 'token=abc==']))
    expect(picked.auth).toEqual({ username: 'user', password: 'pass:word' })
    expect(picked.cookies).toEqual([{ name: 'token', value: 'abc==' }])
    expect(picked.extraHeaders).toEqual({ Authorization: 'Bearer abc==' })
    expect(picked.defaultQueryParams).toEqual({ token: 'abc==' })
  })

  it('treats the documented --reporter false value as disabled', () => {
    expect(resolveCiReporter('false', 'jsonExpanded')).toBe(false)
    expect(resolveCiReporter(undefined, false)).toBe(false)
    expect(resolveCiReporter(undefined, undefined)).toBe('jsonSimple')
  })

  it('cache on', () => {
    const picked = pickOptions(args(['--cache']))
    expect(picked.cache).toBeTruthy()
  })
  it('cache off', () => {
    const picked = pickOptions(args(['--no-cache']))
    expect(picked.cache).toBeFalsy()
  })

  it('urls csv', () => {
    const options = args(['--urls', '/my-path,/second-path', '--debug'])
    expect(options.urls).toMatchInlineSnapshot('"/my-path,/second-path"')
    const picked = pickOptions(options)
    expect(picked.urls).toMatchInlineSnapshot(`
      [
        "/my-path",
        "/second-path",
      ]
    `)
  })

  it('cookies - single', () => {
    const picked = pickOptions(args(['--cookies', 'foo=bar']))
    expect(picked.cookies).toMatchInlineSnapshot(`
      [
        {
          "name": "foo",
          "value": "bar",
        },
      ]
    `)
  })

  it('cookies - multiple', () => {
    const picked = pickOptions(args(['--cookies', 'my-jwt-token=<token>;my-other-cookie=value']))
    expect(picked.cookies).toMatchInlineSnapshot(`
      [
        {
          "name": "my-jwt-token",
          "value": "<token>",
        },
        {
          "name": "my-other-cookie",
          "value": "value",
        },
      ]
    `)
  })

  it('extraHeaders - single', () => {
    const picked = pickOptions(args(['--extra-headers', 'foo=bar']))
    expect(picked.extraHeaders).toMatchInlineSnapshot(`
      {
        "foo": "bar",
      }
    `)
  })

  it('extraHeaders - multiple', () => {
    const picked = pickOptions(args(['--extra-headers', 'foo=bar,my-other-header=value']))
    expect(picked.extraHeaders).toMatchInlineSnapshot(`
      {
        "foo": "bar",
        "my-other-header": "value",
      }
    `)
  })

  describe('--device flag', () => {
    it('parses a single device', () => {
      expect(parseDevices(args(['--device', 'mobile']))).toEqual(['mobile'])
    })

    it('parses a comma-separated list', () => {
      expect(parseDevices(args(['--device', 'mobile,desktop']))).toEqual(['mobile', 'desktop'])
    })

    it('preserves order and deduplicates entries', () => {
      expect(parseDevices(args(['--device', 'desktop, mobile , desktop']))).toEqual(['desktop', 'mobile'])
    })

    it('returns undefined when --device is absent', () => {
      expect(parseDevices(args([]))).toBeUndefined()
    })

    it('exits with a clear error for an invalid device', () => {
      const options = args(['--device', 'tablet'])

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__exit__')
      }) as never)
      const stderrChunks: string[] = []
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(((chunk: unknown) => {
          stderrChunks.push(String(chunk))
          return true
        }) as never)

      expect(() => parseDevices(options)).toThrow('__exit__')
      expect(exitSpy).toHaveBeenCalledWith(1)
      const errOutput = stderrChunks.join('')
      expect(errOutput).toContain('tablet')
      expect(errOutput).toContain('mobile')
      expect(errOutput).toContain('desktop')

      exitSpy.mockRestore()
      stderrSpy.mockRestore()
    })

    it('--device wins over --mobile / --desktop for scanner.device', () => {
      const picked = pickOptions(args(['--mobile', '--device', 'desktop']))
      expect(picked.scanner?.device).toBe('desktop')
    })

    it('sets scanner.device to the first device for a multi-device list', () => {
      const picked = pickOptions(args(['--device', 'desktop,mobile']))
      expect(picked.scanner?.device).toBe('desktop')
    })

    it('legacy --mobile still resolves scanner.device when --device is absent', () => {
      const picked = pickOptions(args(['--mobile']))
      expect(picked.scanner?.device).toBe('mobile')
    })
  })
})
