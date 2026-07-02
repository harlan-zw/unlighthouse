// D-033: three-leg parity. The CLI is the third projection of the command
// registry (alongside HTTP in api-parity.test.ts and MCP in mcp.test.ts). Every
// non-CLI-hidden command must project to a citty subcommand whose flags are
// exactly `cittyFlagsFor(cmd.input)`, so the CLI can't drift from the registry.

import type { HandlerMap } from '@unlighthouse/core/api/handlers'
import { describe, expect, it } from 'vitest'
import { commands } from '@unlighthouse/contracts/commands'
import { parseRootArgs } from '../packages/unlighthouse/src/cli/createCli'
import { cittyFlagsFor, projectCliCommands } from '../packages/unlighthouse/src/cli/project'

// The projector only invokes these inside a subcommand's run(); the parity test
// never runs a leaf, so stubs are fine.
const projection = {
  handlers: {} as HandlerMap,
  createCtx: () => ({} as never),
  emit: () => {},
}

describe('cli parity (D-033: third registry projection)', () => {
  const { leafFlagsByName, subCommands } = projectCliCommands(projection)
  const visible = Object.values(commands).filter(cmd => !cmd.cli?.hidden)

  it('projects every non-hidden command', () => {
    for (const cmd of visible)
      expect(leafFlagsByName.has(cmd.name), `${cmd.name} missing from CLI projection`).toBe(true)
    expect(leafFlagsByName.size).toBe(visible.length)
  })

  it('omits cli.hidden commands', () => {
    for (const cmd of Object.values(commands)) {
      if (cmd.cli?.hidden)
        expect(leafFlagsByName.has(cmd.name), `${cmd.name} is cli.hidden but was projected`).toBe(false)
    }
  })

  it.each(visible.map(c => [c.name, c] as const))('%s flags equal cittyFlagsFor(input)', (name, cmd) => {
    expect(leafFlagsByName.get(name)).toEqual(cittyFlagsFor(cmd.input))
  })

  it('nests dot-namespaced commands under a parent subcommand', () => {
    // scan.start -> subCommands.scan.subCommands.start
    const scan = subCommands.scan as { subCommands?: Record<string, unknown> }
    expect(scan?.subCommands?.start).toBeDefined()
    // top-level (manifest) is a leaf directly
    expect(subCommands.manifest).toBeDefined()
  })

  it('cittyFlagsFor derives boolean vs string types', () => {
    const flags = cittyFlagsFor(commands['scan.start'].input) as Record<string, { type: string, required?: boolean }>
    // `site` is a string flag; every derived flag is string or boolean.
    expect(flags.site?.type).toBe('string')
    for (const [key, def] of Object.entries(flags))
      expect(['string', 'boolean'], `${key} has unexpected type ${def.type}`).toContain(def.type)
  })
})

// The citty root command must produce the same parsed CliOptions the previous
// cac program did (byte-identical root behaviour). Guards the cac->citty
// tripwires: --no-cache negation, comma-list flags, numeric coercion.
describe('cli root parse parity (cac -> citty)', () => {
  const rawArgs = [
    '--site', 'https://x.com', '--no-cache', '--device', 'mobile,desktop',
    '--samples', '3', '--throttle', '--router-prefix', '/rp', '--urls', '/a,/b',
    '--auth', 'u:p', '--debug', '--assert', '--history',
  ]
  const opts = parseRootArgs(rawArgs)

  it('reproduces the cac-parsed CliOptions shape', () => {
    expect(opts).toMatchObject({
      site: 'https://x.com',
      cache: false, // --no-cache
      device: 'mobile,desktop',
      samples: 3, // coerced to number
      throttle: true,
      routerPrefix: '/rp',
      urls: '/a,/b',
      auth: 'u:p',
      debug: true,
      assert: true,
      history: true,
    })
  })

  it('samples is numeric, not a string', () => {
    expect(typeof opts.samples).toBe('number')
  })

  it('leaves cache undefined when neither --cache nor --no-cache is passed', () => {
    const bare = parseRootArgs(['--site', 'https://x.com'])
    expect(bare.cache).toBeUndefined()
  })
})
