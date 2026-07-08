import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const extensionRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(moduleDirname, '..', '..');
const serverPath = path.resolve(moduleDirname, '..', '..', 'dist', 'src', 'mcp', 'maestro-server.js');
const srcRoot = path.resolve(path.dirname(serverPath), '..');
if (!fs.existsSync(serverPath) || !fs.existsSync(path.join(srcRoot, 'core', 'logger.js'))) {
  throw new Error('Compiled MCP server not found. Run `npm run build` before launching claude/mcp/maestro-server.js.');
}
const { main } = await import(pathToFileURL(serverPath).href);

process.env.MAESTRO_RUNTIME = 'claude';
process.env.MAESTRO_EXTENSION_PATH = extensionRoot;
main();
