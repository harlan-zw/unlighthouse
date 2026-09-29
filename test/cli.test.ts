import { describe, expect, it } from 'vitest'
import createCli, { createCiCli } from '../packages/cli/src/createCli'
import { pickCiOptions, pickOptions } from '../packages/cli/src/util'

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

  it('cache flag omitted leaves the config value alone', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv([]))
    const picked = pickOptions(options)
    expect(picked.cache).toBeUndefined()
  })

  it('cookies keep every = after the first', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--cookies', 'sid=abc=def;token=eyJ==']))
    const picked = pickOptions(options)
    expect(picked.cookies).toEqual([
      { name: 'sid', value: 'abc=def' },
      { name: 'token', value: 'eyJ==' },
    ])
  })

  it('extra headers keep every = after the first', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--extra-headers', 'x-token=a=b,Authorization=Basic dXNlcjpwYXNz']))
    const picked = pickOptions(options)
    expect(picked.extraHeaders).toEqual({ 'x-token': 'a=b', 'Authorization': 'Basic dXNlcjpwYXNz' })
  })

  it('auth password keeps every : after the first', async () => {
    const cli = createCli()
    const { options } = cli.parse(argsv(['--auth', 'admin:pa:ss']))
    const picked = pickOptions(options)
    expect(picked.auth).toEqual({ username: 'admin', password: 'pa:ss' })
  })
})

describe('ci args', () => {
  function parseCi(args: string[]) {
    const { options } = createCiCli().parse(argsv(args))
    return pickCiOptions(options)
  }

  it('build static flag omitted leaves the config value alone', () => {
    expect(parseCi([]).ci?.buildStatic).toBeUndefined()
  })

  it('build static flag enables it', () => {
    expect(parseCi(['--build-static']).ci?.buildStatic).toBe(true)
  })

  it('budget flag omitted leaves the config value alone', () => {
    expect(parseCi([]).ci?.budget).toBeUndefined()
  })
})
