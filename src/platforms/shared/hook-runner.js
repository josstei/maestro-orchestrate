'use strict';

const { requireFromCanonicalSrc } = require('./canonical-source');

const VALID_RUNTIMES = new Set(['gemini', 'claude']);

const HOOK_MAP = {
  'session-start': { module: 'hooks/logic/session-start-logic.js', fn: 'handleSessionStart' },
  'session-end':   { module: 'hooks/logic/session-end-logic.js',   fn: 'handleSessionEnd'   },
  'before-agent':  { module: 'hooks/logic/before-agent-logic.js',  fn: 'handleBeforeAgent'  },
  'after-agent':   { module: 'hooks/logic/after-agent-logic.js',   fn: 'handleAfterAgent'   },
};

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
const logicModule = requireFromCanonicalSrc(hookEntry.module, __dirname);
const handler = logicModule[hookEntry.fn];

adapter.readBoundedStdin()
  .then((raw) => {
    const ctx = adapter.normalizeInput(raw);
    return handler(ctx);
  })
  .then((result) => {
    process.stdout.write(JSON.stringify(adapter.formatOutput(result)) + '\n');
  })
  .catch((err) => {
    process.stderr.write('Hook error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify(adapter.errorFallback()) + '\n');
  });
