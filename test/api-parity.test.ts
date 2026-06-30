// Parity test: every command in the registry projects to HTTP, has a handler,
// has Zod input/output schemas, and obeys the documented method conventions.
// See v1-tasks.md §v2 + v1.md §"API extraction".

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { commands, commandToRoute } from '@unlighthouse/contracts/commands'
import { createHandlers } from '@unlighthouse/core/api/handlers'

const STREAMING_NAMES = new Set(['events.subscribe', 'events.tail'])

describe('api parity', () => {
  const handlers = createHandlers()
  const commandList = Object.entries(commands)

  it('registry has 35 commands', () => {
    expect(commandList.length).toBe(35)
  })

  it.each(commandList)('%s has a handler', (name) => {
    expect(handlers[name as keyof typeof handlers]).toBeDefined()
    expect(typeof handlers[name as keyof typeof handlers].run).toBe('function')
  })

  it.each(commandList)('%s has zod input + output schemas', (_name, cmd) => {
    expect(cmd.input).toBeInstanceOf(z.ZodType)
    expect(cmd.output).toBeInstanceOf(z.ZodType)
  })

  it.each(commandList)('%s description is non-empty', (_name, cmd) => {
    expect(cmd.description.length).toBeGreaterThan(0)
  })

  // Server and client now derive routes from this same `commandToRoute`
  // (in @unlighthouse/contracts), so they can no longer disagree by
  // construction — the old server-vs-client parity case is obsolete.

  it.each(commandList)('%s method is GET or POST', (_name, cmd) => {
    const { method } = commandToRoute(cmd)
    expect(['GET', 'POST']).toContain(method)
  })

  it.each(commandList)('%s streaming flag matches the known streaming set', (name, cmd) => {
    const expected = STREAMING_NAMES.has(name)
    expect(Boolean(cmd.streaming)).toBe(expected)
  })

  it.each(commandList)('%s path is /<name with dots → slashes>', (name, cmd) => {
    if (cmd.http?.path)
      return // explicit override; honored.
    const { path } = commandToRoute(cmd)
    expect(path).toBe(`/${name.split('.').join('/')}`)
  })
})
