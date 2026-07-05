import fs from 'node:fs';
import path from 'node:path';
import { isAdapterFile, extractRuntime } from './adapters/conventions.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ADAPTERS_DIR = path.join(moduleDirname, 'adapters');

const VALID_RUNTIMES = new Set(
  fs.readdirSync(ADAPTERS_DIR)
    .filter(isAdapterFile)
    .map(extractRuntime)
);

const HOOK_MAP = JSON.parse(
  readFileSync(new URL('../../generated/hook-registry.json', import.meta.url))
);

const runtime  = process.argv[2];
const hookName = process.argv[3];

if (!runtime || !hookName) {
  process.stderr.write('Usage: node hook-runner.js <runtime> <hook-name>\n');
  process.exit(1);
}

if (!VALID_RUNTIMES.has(runtime)) {
  process.stderr.write('Unknown runtime: ' + runtime + '\n');
  process.exit(1);
}

const hookEntry = HOOK_MAP[hookName];

if (!hookEntry) {
  process.stderr.write('Unknown hook: ' + hookName + '\n');
  process.exit(1);
}

const { default: adapter } = await import(pathToFileURL(path.join(ADAPTERS_DIR, runtime + '-adapter.js')).href);
const logicModule = await import(pathToFileURL(path.resolve(moduleDirname, '../../', hookEntry.module)).href);
const handler = logicModule[hookEntry.fn];

adapter.readBoundedStdin()
  .then((raw) => {
    const ctx = adapter.normalizeInput(raw);
    return handler(ctx);
  })
  .then((result) => {
    process.stdout.write(JSON.stringify(adapter.formatOutput(result)) + '\n');
    process.exitCode = adapter.getExitCode(result);
  })
  .catch((err) => {
    process.stderr.write('Hook error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify(adapter.errorFallback()) + '\n');
  });
