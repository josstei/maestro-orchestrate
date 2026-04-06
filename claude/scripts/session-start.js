'use strict';

const { normalizeInput, formatOutput, readBoundedStdin } = require('./hook-adapter');
const { handleSessionStart } = require('../../src/lib/hooks/session-start-logic.js');

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
    process.stdout.write(JSON.stringify({ "continue": true, "decision": "approve" }) + '\n');
  });
