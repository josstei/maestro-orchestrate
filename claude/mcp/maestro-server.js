import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../src/mcp/maestro-server.js';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const extensionRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(moduleDirname, '..', '..');
process.env.MAESTRO_RUNTIME = 'claude';
process.env.MAESTRO_EXTENSION_PATH = extensionRoot;
main();
