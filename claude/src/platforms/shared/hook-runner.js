'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readStdin } = require('../../lib/io');
const { RUNTIME_NAMES } = require('../runtime-config-map');
const HOOK_MAP = require('../../generated/hook-registry.json');

/**
 * A runtime takes hooks when its platform dir has a hook adapter exporting:
 *   normalizeInput(raw)  -> ctx     (runtime stdin -> internal context)
 *   formatOutput(result) -> object  (internal result -> runtime stdout)
 *   errorFallback           object  (emitted when the hook run fails, e.g. on bad stdin)
 *   getExitCode(result)  -> number  (optional; the exit code defaults to 0)
 */

const runtime  = process.argv[2];
const hookName = process.argv[3];

if (!runtime || !hookName) {
  process.stderr.write('Usage: node hook-runner.js <runtime> <hook-name>\n');
  process.exit(1);
}

// Codex has a runtime config but no hook adapter, so it takes no hooks.
const adapterPath = path.join(__dirname, '..', runtime, 'hook-adapter.js');
if (!RUNTIME_NAMES.includes(runtime) || !fs.existsSync(adapterPath)) {
  process.stderr.write('Unknown runtime: ' + runtime + '\n');
  process.exit(1);
}

const hookEntry = Object.hasOwn(HOOK_MAP, hookName) ? HOOK_MAP[hookName] : null;
if (!hookEntry) {
  process.stderr.write('Unknown hook: ' + hookName + '\n');
  process.exit(1);
}

const adapter = require(adapterPath);
const handler = require(path.resolve(__dirname, '../../', hookEntry.module))[hookEntry.fn];

readStdin()
  .then((raw) => handler(adapter.normalizeInput(JSON.parse(raw))))
  .then((result) => {
    process.stdout.write(JSON.stringify(adapter.formatOutput(result)) + '\n');
    process.exitCode = adapter.getExitCode ? adapter.getExitCode(result) : 0;
  })
  .catch((err) => {
    process.stderr.write('Hook error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify(adapter.errorFallback) + '\n');
  });
