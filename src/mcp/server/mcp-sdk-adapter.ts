import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

type MaestroMcpServerInfo = Readonly<{
  name: string;
  version: string;
}>;

type MaestroMcpServerOptions = Readonly<{
  capabilities?: {
    tools?: Record<string, unknown>;
  };
}>;

type MaestroMcpServer = McpServer;
type MaestroMcpTransport = StdioServerTransport;

const ROOTS_LIST_CHANGED_NOTIFICATION_SCHEMA = RootsListChangedNotificationSchema;

function createMaestroMcpServer(
  serverInfo: MaestroMcpServerInfo,
  options: MaestroMcpServerOptions = {},
): MaestroMcpServer {
  return new McpServer(serverInfo, {
    capabilities: {
      tools: {},
      ...(options.capabilities || {}),
    },
  });
}

function createMaestroStdioTransport(): MaestroMcpTransport {
  return new StdioServerTransport();
}

async function connectMaestroMcpServer(
  server: { connect: (transport: unknown) => Promise<unknown> },
  transport: unknown = createMaestroStdioTransport(),
): Promise<void> {
  await server.connect(transport);
}

export {
  ROOTS_LIST_CHANGED_NOTIFICATION_SCHEMA,
  connectMaestroMcpServer,
  createMaestroMcpServer,
  createMaestroStdioTransport,
};
export type {
  MaestroMcpServer,
  MaestroMcpServerInfo,
  MaestroMcpServerOptions,
  MaestroMcpTransport,
};
