// stdio transport entrypoint used by `bin/unlighthouse-mcp`.

import type { CreateMcpServerOptions } from './projection.ts'
import { createMcpServer } from './projection.ts'

export async function startStdioServer(opts: CreateMcpServerOptions): Promise<void> {
  const server = await createMcpServer(opts)
  const stdioModule = opts.runtime?.stdio ?? '@modelcontextprotocol/sdk/server/stdio.js'
  const { StdioServerTransport } = await import(stdioModule) as typeof import('@modelcontextprotocol/sdk/server/stdio.js')
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Resolve when the transport closes.
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve()
  })
}
