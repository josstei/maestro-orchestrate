'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { collectStdin } = require('../../core/stdin-reader');

/**
 * A runtime takes hooks when its platform dir has a hook adapter exporting:
 *   normalizeInput(raw)  -> ctx     (runtime stdin -> internal context)
 *   formatOutput(result) -> object  (internal result -> runtime stdout)
 *   errorFallback        -> object  (emitted when the hook run fails, e.g. on bad stdin)
 *   denyExitCode         -> number  (optional exit code for a deny result; otherwise 0)
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
 * prints the adapter's errorFallback.
 */
function main(runtime, hookName) {
  const hookEntry = HOOK_MAP[hookName];
  const usageError = !runtime || !hookName ? 'Usage: node hook-runner.js <runtime> <hook-name>'
    : !VALID_RUNTIMES.has(runtime) ? `Unknown runtime: ${runtime}`
      : !hookEntry ? `Unknown hook: ${hookName}` : null;
  if (usageError) {
    process.stderr.write(usageError + '\n');
    process.exit(1);
  }

  // maestro-dependencies: hook-adapters
  const adapter = require(path.join(PLATFORMS_DIR, runtime, HOOK_ADAPTER));
  // maestro-dependencies: hook-handlers
  const handler = require(path.resolve(__dirname, '../../', hookEntry.module))[hookEntry.fn];

  return collectStdin()
    .then((raw) => handler(adapter.normalizeInput(JSON.parse(raw))))
    .then((result) => {
      process.stdout.write(JSON.stringify(adapter.formatOutput(result)) + '\n');
      process.exitCode = (result.action === 'deny' && adapter.denyExitCode) || 0;
    })
    .catch((err) => {
      process.stderr.write('Hook error: ' + err.message + '\n');
      process.stdout.write(JSON.stringify(adapter.errorFallback) + '\n');
    });
}

module.exports = { main };
