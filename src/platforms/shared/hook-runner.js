'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isAdapterFile, extractRuntime } = require('./adapters/conventions');

const ADAPTERS_DIR = path.join(__dirname, 'adapters');
const VALID_RUNTIMES = new Set(
  fs.readdirSync(ADAPTERS_DIR)
    .filter(isAdapterFile)
    .map(extractRuntime)
);

const HOOK_MAP = require('../../generated/hook-registry.json');

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

const adapter = require('./adapters/' + runtime + '-adapter');
const logicModule = require(path.resolve(__dirname, '../../', hookEntry.module));
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
    process.exitCode = adapter.getExitCode({ action: 'deny' });
  });
