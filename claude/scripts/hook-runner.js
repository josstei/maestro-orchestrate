import path from 'node:path';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const extensionRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(moduleDirname, '..', '..');
process.env.MAESTRO_EXTENSION_PATH = extensionRoot;
await import('../../dist/src/platforms/shared/hook-runner.js');
