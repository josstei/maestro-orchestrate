import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveVersion } from '../../core/version.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

export function createMcpServer() {
  return new McpServer({ name: 'maestro', version: resolveVersion(moduleDirname) }, { capabilities: { tools: {} } });
}

export async function startMcpServer(server) {
  await server.connect(new StdioServerTransport());
}
