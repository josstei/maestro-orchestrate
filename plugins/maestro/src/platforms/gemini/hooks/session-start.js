'use strict';

const { requireFromCanonicalSrc } = require('./canonical-source');
const { normalizeInput, formatOutput, readBoundedStdin } = require('./hook-adapter');
const { handleSessionStart } = requireFromCanonicalSrc('hooks/logic/session-start-logic.js', __dirname);

readBoundedStdin()
  .then((raw) => {
    const ctx = normalizeInput(raw);
    return handleSessionStart(ctx);
  })
  .then((result) => {
    process.stdout.write(JSON.stringify(formatOutput(result)) + '\n');
  })
  .catch((err) => {
    process.stderr.write('Hook error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify({ "continue": true }) + '\n');
  });
