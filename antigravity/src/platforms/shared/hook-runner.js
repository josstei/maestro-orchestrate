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
 * Run the registered hook `hookName` for `runtime`; the generated hook-runner
 * launchers call this with the hook command's arguments. Missing arguments, an
 * unknown runtime, or an unknown hook print usage or `Unknown runtime/hook:
 * <name>` to stderr and exit 1. The payload is read from stdin under the
 * shared 1 MiB cap (src/core/stdin-reader.js) and parsed as JSON; an oversize
 * or unparseable payload, like a failing handler, logs `Hook error: <message>`
 * to stderr and answers the adapter's `errorFallback()`.
 *
 * @param {string} runtime - runtime name, e.g. 'claude'
 * @param {string} hookName - hook registry name, e.g. 'session-start'
 * @returns {Promise<void>}
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
