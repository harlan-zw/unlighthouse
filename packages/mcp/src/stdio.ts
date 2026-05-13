// stdio transport entrypoint used by `bin/unlighthouse-mcp`.

import type { CreateMcpServerOptions } from './projection'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './projection'

export async function startStdioServer(opts: CreateMcpServerOptions): Promise<void> {
  const server = createMcpServer(opts)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Resolve when the transport closes.
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve()
  })
}
