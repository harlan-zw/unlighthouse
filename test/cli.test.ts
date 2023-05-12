import { describe, expect, it } from 'vitest'
import createCli from '../packages/cli/src/createCli'
import { pickOptions } from '../packages/cli/src/util'

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
})
