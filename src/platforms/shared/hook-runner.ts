import fs from 'node:fs';
import path from 'node:path';
import { isAdapterFile, extractRuntime } from './adapters/conventions.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { HookContext, HookResult, RuntimeAdapter } from './adapters/factory.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ADAPTERS_DIR = path.join(moduleDirname, 'adapters');

const VALID_RUNTIMES = new Set(
  fs.readdirSync(ADAPTERS_DIR)
    .filter(isAdapterFile)
    .map(extractRuntime)
    .filter((runtime): runtime is string => runtime != null)
);

const HOOK_MAP = JSON.parse(
  readFileSync(new URL('../../generated/hook-registry.json', import.meta.url), 'utf8')
) as Record<string, { module: string; fn: string }>;

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

const { default: adapter } = await import(pathToFileURL(path.join(ADAPTERS_DIR, runtime + '-adapter.js')).href) as { default: RuntimeAdapter };
const logicModule = await import(pathToFileURL(path.resolve(moduleDirname, '../../', hookEntry.module)).href) as Record<string, unknown>;
const handler = logicModule[hookEntry.fn] as ((ctx: HookContext) => HookResult | Promise<HookResult>) | undefined;

if (typeof handler !== 'function') {
  process.stderr.write('Unknown hook handler: ' + hookEntry.fn + '\n');
  process.exit(1);
}

adapter.readBoundedStdin()
  .then((raw: unknown) => {
    const ctx = adapter.normalizeInput(raw as Record<string, any>);
    return handler(ctx);
  })
  .then((result: HookResult) => {
    process.stdout.write(JSON.stringify(adapter.formatOutput(result)) + '\n');
    process.exitCode = adapter.getExitCode(result);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write('Hook error: ' + message + '\n');
    process.stdout.write(JSON.stringify(adapter.errorFallback()) + '\n');
  });
