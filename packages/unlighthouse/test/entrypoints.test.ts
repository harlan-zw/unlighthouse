import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('public executable entrypoints', () => {
  it('imports the CLI entrypoint without parsing arguments or running it', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const cli = await import('../src/cli/cli')

    expect(cli.createCliCommand).toBeTypeOf('function')
    expect(cli.runCli).toBeTypeOf('function')
    expect(exit).not.toHaveBeenCalled()
  })

  it('imports the CI entrypoint without parsing arguments or running it', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const ci = await import('../src/cli/ci')

    expect(ci.createCiCli).toBeTypeOf('function')
    expect(ci.runCi).toBeTypeOf('function')
    expect(exit).not.toHaveBeenCalled()
  })
})
