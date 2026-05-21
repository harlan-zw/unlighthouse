import { describe, expect, it, vi } from 'vitest'
import createCli from '../packages/unlighthouse/src/cli/createCli'
import { parseDevices, pickOptions } from '../packages/unlighthouse/src/cli/util'

const argsv = (args: string[]) => ['node', 'unlighthouse.js', '--site', 'unlighthouse.dev', ...args]

describe('cli args', () => {
  it('cache on', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--cache']))
    const picked = pickOptions(options)
    expect(picked.cache).toBeTruthy()
  })
  it('cache off', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--no-cache']))
    const picked = pickOptions(options)
    expect(picked.cache).toBeFalsy()
  })

  it('urls csv', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--urls', '/my-path,/second-path', '--debug']))
    expect(options.urls).toMatchInlineSnapshot('"/my-path,/second-path"')
    const picked = pickOptions(options)
    expect(picked.urls).toMatchInlineSnapshot(`
      [
        "/my-path",
        "/second-path",
      ]
    `)
  })

  it('cookies - single', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--cookies', 'foo=bar']))
    const picked = pickOptions(options)
    expect(picked.cookies).toMatchInlineSnapshot(`
      [
        {
          "name": "foo",
          "value": "bar",
        },
      ]
    `)
  })

  it('cookies - multiple', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--cookies', 'my-jwt-token=<token>;my-other-cookie=value']))
    const picked = pickOptions(options)
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

  it ('extraHeaders - single', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--extraHeaders', 'foo=bar']))
    const picked = pickOptions(options)
    expect(picked.extraHeaders).toMatchInlineSnapshot(`
      {
        "foo": "bar",
      }
    `)
  })

  it ('extraHeaders - multiple', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--extraHeaders', 'foo=bar,my-other-header=value']))
    const picked = pickOptions(options)
    expect(picked.extraHeaders).toMatchInlineSnapshot(`
      {
        "foo": "bar",
        "my-other-header": "value",
      }
    `)
  })

  describe('--device flag', () => {
    it('parses a single device', () => {
      const cli = createCli()
      const { options } = cli.parse(argsv(['--device', 'mobile']))
      expect(parseDevices(options)).toEqual(['mobile'])
    })

    it('parses a comma-separated list', () => {
      const cli = createCli()
      const { options } = cli.parse(argsv(['--device', 'mobile,desktop']))
      expect(parseDevices(options)).toEqual(['mobile', 'desktop'])
    })

    it('preserves order and deduplicates entries', () => {
      const cli = createCli()
      const { options } = cli.parse(argsv(['--device', 'desktop, mobile , desktop']))
      expect(parseDevices(options)).toEqual(['desktop', 'mobile'])
    })

    it('returns undefined when --device is absent', () => {
      const cli = createCli()
      const { options } = cli.parse(argsv([]))
      expect(parseDevices(options)).toBeUndefined()
    })

    it('exits with a clear error for an invalid device', () => {
      const cli = createCli()
      const { options } = cli.parse(argsv(['--device', 'tablet']))

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__exit__')
      }) as never)
      // Consola writes to process.stderr; capture it so we can assert the
      // message names the offending value and the valid options without
      // leaking the error into the test output.
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
      const cli = createCli()
      const { options } = cli.parse(argsv(['--mobile', '--device', 'desktop']))
      const picked = pickOptions(options)
      expect(picked.scanner?.device).toBe('desktop')
    })

    it('sets scanner.device to the first device for a multi-device list', () => {
      const cli = createCli()
      const { options } = cli.parse(argsv(['--device', 'desktop,mobile']))
      const picked = pickOptions(options)
      expect(picked.scanner?.device).toBe('desktop')
    })

    it('legacy --mobile still resolves scanner.device when --device is absent', () => {
      const cli = createCli()
      const { options } = cli.parse(argsv(['--mobile']))
      const picked = pickOptions(options)
      expect(picked.scanner?.device).toBe('mobile')
    })
  })
})
