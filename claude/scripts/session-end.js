'use strict';

const { normalizeInput, formatOutput, readBoundedStdin } = require('./hook-adapter');
const { handleSessionEnd } = require('../lib/hooks/session-end-logic.js');

readBoundedStdin()
  .then((raw) => {
    const ctx = normalizeInput(raw);
    return handleSessionEnd(ctx);
  })
  .then((result) => {
    process.stdout.write(JSON.stringify(formatOutput(result)) + '\n');
  })
  .catch((err) => {
    process.stderr.write('Hook error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify({ "continue": true, "decision": "approve" }) + '\n');
  });
