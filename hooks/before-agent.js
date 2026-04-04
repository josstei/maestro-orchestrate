'use strict';

const { normalizeInput, formatOutput, readBoundedStdin } = require('./hook-adapter');
const { handleBeforeAgent } = require('../lib/hooks/before-agent-logic.js');

readBoundedStdin()
  .then((raw) => {
    const ctx = normalizeInput(raw);
    return handleBeforeAgent(ctx);
  })
  .then((result) => {
    process.stdout.write(JSON.stringify(formatOutput(result)) + '\n');
  })
  .catch((err) => {
    process.stderr.write('Hook error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify({ "continue": true }) + '\n');
  });
