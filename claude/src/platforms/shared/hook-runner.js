'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { collectStdin } = require('../../core/stdin-reader');

/**
 * A runtime takes hooks when its platform dir has a hook adapter exporting:
 *   normalizeInput(raw)  -> ctx     (runtime stdin -> internal context)
 *   formatOutput(result) -> object  (internal result -> runtime stdout)
 *   errorFallback()      -> object  (emitted when the hook run fails, e.g. on bad stdin)
 *   getExitCode(result)  -> number  (optional; the exit code defaults to 0)
 */
const PLATFORMS_DIR = path.resolve(__dirname, '..');
const HOOK_ADAPTER = 'hook-adapter.js';
const VALID_RUNTIMES = new Set(
  fs.readdirSync(PLATFORMS_DIR)
    .filter((name) => fs.existsSync(path.join(PLATFORMS_DIR, name, HOOK_ADAPTER)))
);

const HOOK_MAP = require('../../generated/hook-registry.json');

/**
 * Run hook `hookName` for `runtime` (generated launchers pass argv[2..3]). Bad
 * arguments exit 1; a bad payload or a failing handler logs `Hook error:` and
 * prints the adapter's errorFallback().
 */
function main(runtime, hookName) {
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

  // maestro-dependencies: hook-adapters
  const adapter = require(path.join(PLATFORMS_DIR, runtime, HOOK_ADAPTER));
  // maestro-dependencies: hook-handlers
  const logicModule = require(path.resolve(__dirname, '../../', hookEntry.module));
  const handler = logicModule[hookEntry.fn];

  return collectStdin()
    .then(JSON.parse)
    .then((raw) => {
      const ctx = adapter.normalizeInput(raw);
      return handler(ctx);
    })
    .then((result) => {
      process.stdout.write(JSON.stringify(adapter.formatOutput(result)) + '\n');
      process.exitCode = adapter.getExitCode ? adapter.getExitCode(result) : 0;
    })
    .catch((err) => {
      process.stderr.write('Hook error: ' + err.message + '\n');
      process.stdout.write(JSON.stringify(adapter.errorFallback()) + '\n');
    });
}

module.exports = { main };
