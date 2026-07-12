import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const extensionRoot = path.resolve(moduleDirname, '..');
const serverPath = path.resolve(moduleDirname, '..', 'dist', 'src', 'mcp', 'maestro-server.js');
if (!fs.existsSync(serverPath)) {
  throw new Error('Compiled MCP server not found. Run `npm run build` before launching mcp/maestro-server.js.');
}
const { main } = await import(pathToFileURL(serverPath).href);
process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'gemini';
process.env.MAESTRO_EXTENSION_PATH = process.env.MAESTRO_EXTENSION_PATH || extensionRoot;
main();
