import { moduleDirname } from '../../core/package-root.js';
import { resolveVersion } from '../../core/version.js';
import {
  connectMaestroMcpServer,
  createMaestroMcpServer,
} from './mcp-sdk-adapter.js';

export function createMcpServer() {
  return createMaestroMcpServer({ name: 'maestro', version: resolveVersion(moduleDirname(import.meta.url)) });
}

export async function startMcpServer(server: any) {
  await connectMaestroMcpServer(server);
}
