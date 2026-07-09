import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVersion } from '../../core/version.js';
import {
  connectMaestroMcpServer,
  createMaestroMcpServer,
} from './mcp-sdk-adapter.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

export function createMcpServer() {
  return createMaestroMcpServer({ name: 'maestro', version: resolveVersion(moduleDirname) });
}

export async function startMcpServer(server: any) {
  await connectMaestroMcpServer(server);
}
