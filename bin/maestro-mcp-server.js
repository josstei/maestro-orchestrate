#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/mcp/maestro-server.js';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
process.env.MAESTRO_RUNTIME = process.env.MAESTRO_RUNTIME || 'codex';
process.env.MAESTRO_EXTENSION_PATH = path.resolve(moduleDirname, '..');
main();
