#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleDirname } from '../core/module-path.js';
import { resolvePackageRoot } from '../core/package-root.js';

const root = resolvePackageRoot(moduleDirname(import.meta.url), { malformedJson: 'throw' });
const serverPath = path.join(root, 'dist', 'src', 'mcp', 'maestro-server.js');
if (!fs.existsSync(serverPath)) {
  throw new Error('Compiled MCP server not found. Run `npm run build` before launching maestro-mcp-server.');
}
const { main } = await import(pathToFileURL(serverPath).href);
process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'codex';
process.env.MAESTRO_EXTENSION_PATH = root;
main();
